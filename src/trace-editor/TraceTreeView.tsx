import {
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { JsonValue } from '../shared/util_client';
import { getVsCodeApi } from '../shared/webviewApi';
import type { TraceDownMessage, TraceUpMessage } from './messages';
import type { CodeLocation, TraceElement, TraceKind } from './traceUtils';
import {
  type TraceValue,
  type TraceTest,
  formatTraceValue,
  isSubscopeVar,
  str,
  traceValueEqual,
} from './traceUtils';
import { FormattedMessage, useIntl, type IntlShape } from 'react-intl';

// Internal (test.variables) expected values, keyed by dotted path. Outputs are
// checked separately (from the tested scope call's result struct), not here.
type Expected = {
  variables: Map<string, TraceValue>;
};

export type ExpandCommand = { open: boolean; nonce: number };

type Tone = 'scope' | 'branch' | 'error' | 'plain';

type Described = {
  symbol: string;
  label: string;
  detail?: string;
  tone: Tone;
  showsValue: boolean;
};

const ExpectedContext = createContext<Expected | null>(null);
const CwdContext = createContext<string>('');
const ExpandContext = createContext<ExpandCommand | null>(null);

function resolvePath(cwd: string, file: string): string {
  if (!cwd || file.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(file)) {
    return file;
  }
  return `${cwd.replace(/[\\/]+$/, '')}/${file}`;
}

function describe(kind: TraceKind, intl: IntlShape): Described {
  const t = (id: string): string => intl.formatMessage({ id });
  switch (kind.kind) {
    case 'scope_call':
      return {
        symbol: '→',
        label: t('trace.kind.scope'),
        detail: str(kind.name),
        tone: 'scope',
        showsValue: true,
      };
    case 'scope_var': {
      const label =
        kind.input === 'reentrant'
          ? t('trace.kind.scopeContextVariable')
          : kind.input === 'only_input'
            ? t('trace.kind.scopeInputVariable')
            : t('trace.kind.scopeVariable');
      return {
        symbol: '≔',
        label,
        detail: str(kind.name),
        tone: 'plain',
        showsValue: true,
      };
    }
    case 'local_var':
      return {
        symbol: '≔',
        label: t('trace.kind.localVariable'),
        detail: str(kind.name),
        tone: 'plain',
        showsValue: true,
      };
    case 'local_tup':
      return {
        symbol: '≔',
        label: t('trace.kind.localVariables'),
        detail: Array.isArray(kind.names)
          ? (kind.names as unknown[]).map(String).join(', ')
          : undefined,
        tone: 'plain',
        showsValue: true,
      };
    case 'function_call':
      return {
        symbol: '→',
        label: t('trace.kind.function'),
        detail: str(kind.name),
        tone: 'scope',
        showsValue: true,
      };
    case 'branch_condition':
      return {
        symbol: '⊡',
        label: t('trace.kind.condition'),
        tone: 'branch',
        showsValue: true,
      };
    case 'if_branching':
      return {
        symbol: '⊸',
        label: t('trace.kind.branchTaken'),
        tone: 'branch',
        showsValue: false,
      };
    case 'match_branching':
      return {
        symbol: '⊸',
        label: t('trace.kind.branchCase'),
        detail: str(kind.constructor),
        tone: 'branch',
        showsValue: false,
      };
    case 'assertion':
      return {
        symbol: '⊹',
        label: t('trace.kind.assertion'),
        tone: 'plain',
        showsValue: false,
      };
    case 'exception':
      return {
        symbol: '⊕',
        label: t('trace.kind.definition'),
        detail: kind.label !== undefined ? str(kind.label) : undefined,
        tone: 'plain',
        showsValue: false,
      };
    case 'error':
      return {
        symbol: '⨉',
        label: t('trace.kind.error'),
        detail: [str(kind.type), str(kind.message)].filter(Boolean).join(': '),
        tone: 'error',
        showsValue: false,
      };
    default:
      return {
        symbol: '•',
        label: kind.kind,
        tone: 'plain',
        showsValue: false,
      };
  }
}

function toneColor(tone: Tone): string | undefined {
  switch (tone) {
    case 'scope':
      return 'var(--vscode-symbolIcon-functionForeground, var(--vscode-terminal-ansiCyan))';
    case 'branch':
      return 'var(--vscode-symbolIcon-keywordForeground, var(--vscode-terminal-ansiBlue))';
    case 'error':
      return 'var(--vscode-errorForeground)';
    default:
      return undefined;
  }
}

/** Related source locations attached to an `error` element. */
function relatedLocations(kind: TraceKind): CodeLocation[] {
  const rp = kind.related_pos;
  return Array.isArray(rp) ? (rp as unknown as CodeLocation[]) : [];
}

function isSingleLine(pos?: CodeLocation): pos is CodeLocation {
  return (
    !!pos &&
    typeof pos.file === 'string' &&
    !!pos.start &&
    !!pos.end &&
    pos.start.line === pos.end.line
  );
}

/** Plain-text rendering of a position, e.g. for the search filter. */
function posText(pos?: CodeLocation): string {
  if (!pos || typeof pos.file !== 'string') {
    return '';
  }
  const line = pos.start?.line;
  return line !== undefined ? `${pos.file}:${line}` : pos.file;
}

/** A clickable link that opens the file at the given position in a new tab. */
function formatPos(
  pos: CodeLocation | undefined,
  inline = false
): ReactElement | null {
  const text = posText(pos);
  if (!pos || !text) {
    return null;
  }
  return <PosLink pos={pos} text={text} inline={inline} />;
}

function PosLink({
  pos,
  text,
  inline = false,
}: {
  pos: CodeLocation;
  text: string;
  inline?: boolean;
}): ReactElement {
  const cwd = useContext(CwdContext);
  const intl = useIntl();
  const onClick = (e: MouseEvent): void => {
    e.stopPropagation();
    const message: TraceUpMessage = {
      kind: 'openLocation',
      file: resolvePath(cwd, pos.file),
      start: pos.start ?? { line: 1, character: 1 },
      end: pos.end ?? pos.start ?? { line: 1, character: 1 },
    };
    getVsCodeApi().postMessage(message);
  };
  return (
    <a
      onClick={onClick}
      title={intl.formatMessage({ id: 'trace.openLocation' }, { target: text })}
      style={inline ? posLinkInlineStyle : posLinkStyle}
    >
      {text}
    </a>
  );
}

// -- Source line extraction (lazy request/response with the extension) --------

const extractCache = new Map<string, string | null>();
const pendingExtracts = new Map<number, (line: string | null) => void>();
let extractSeq = 0;
let extractListenerAttached = false;

function ensureExtractListener(): void {
  if (extractListenerAttached) {
    return;
  }
  extractListenerAttached = true;
  window.addEventListener('message', (event: MessageEvent): void => {
    const m = event.data as TraceDownMessage;
    if (m?.kind === 'extract') {
      const callback = pendingExtracts.get(m.id);
      if (callback) {
        pendingExtracts.delete(m.id);
        callback(m.text);
      }
    }
  });
}

async function fetchExtract(
  file: string,
  line: number
): Promise<string | null> {
  const key = `${file}:${line}`;
  const cached = extractCache.get(key);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  ensureExtractListener();
  const id = extractSeq++;
  return new Promise<string | null>((resolve) => {
    pendingExtracts.set(id, resolve);
    const message: TraceUpMessage = {
      kind: 'requestExtract',
      id,
      file,
      line,
    };
    getVsCodeApi().postMessage(message);
  }).then((result) => {
    extractCache.set(key, result);
    return result;
  });
}

function SourceLine({
  pos,
  text,
}: {
  pos: CodeLocation;
  text: string;
}): ReactElement {
  const cwd = useContext(CwdContext);
  const intl = useIntl();
  const a = Math.max(0, pos.start.character - 1);
  const b = Math.max(a, pos.end.character - 1);
  const before = text.slice(0, a);
  const mid = text.slice(a, b);
  const after = text.slice(b);
  const onClick = (): void => {
    const message: TraceUpMessage = {
      kind: 'openLocation',
      file: resolvePath(cwd, pos.file),
      start: pos.start,
      end: pos.end,
    };
    getVsCodeApi().postMessage(message);
  };
  return (
    <pre
      style={sourceStyle}
      onClick={onClick}
      title={intl.formatMessage(
        { id: 'trace.openLocation' },
        { target: posText(pos) }
      )}
    >
      {before}
      <mark style={markStyle}>{mid || ' '}</mark>
      {after}
    </pre>
  );
}

function LocationExtract({ pos }: { pos: CodeLocation }): ReactElement | null {
  const cwd = useContext(CwdContext);
  if (pos.start.line !== pos.end.line) {
    return null;
  }
  const line = pos.start.line;
  const [source, setSource] = useState<{ text: string | null; line: number }>({
    text: null,
    line,
  });
  useEffect(() => {
    let cancelled = false;
    void fetchExtract(resolvePath(cwd, pos.file), line).then((text) => {
      if (!cancelled) {
        setSource({ line, text });
      }
    });
    return (): void => {
      cancelled = true;
    };
  }, [cwd, pos]);
  return source.text ? <SourceLine pos={pos} text={source.text} /> : null;
}

function asCodeLocation(v: JsonValue | undefined): CodeLocation | undefined {
  if (
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    typeof (v as { file?: unknown }).file === 'string'
  ) {
    return v as unknown as CodeLocation;
  }
  return undefined;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}

function selfMatches(
  el: TraceElement,
  filter: string,
  intl: IntlShape
): boolean {
  const { label, detail } = describe(el.element, intl);
  const value = el.value !== undefined ? formatTraceValue(el.value) : undefined;
  const text = [
    label,
    detail ?? '',
    value ?? '',
    posText(el.pos),
    safeStringify(el.element),
  ]
    .join(' ')
    .toLowerCase();
  return text.includes(filter);
}

function subtreeMatches(
  el: TraceElement,
  filter: string,
  intl: IntlShape
): boolean {
  if (selfMatches(el, filter, intl)) {
    return true;
  }
  const children = Array.isArray(el.trace) ? el.trace : [];
  return children.some((c) => subtreeMatches(c, filter, intl));
}

function expectedValue(
  expected: Expected,
  fullPath: string
): TraceValue | undefined {
  return expected.variables.get(fullPath);
}

function isMismatch(exp: TraceValue | undefined, value: TraceValue): boolean {
  return exp !== undefined && !traceValueEqual(exp, value);
}

function subtreeHasMismatch(
  el: TraceElement,
  prefix: string,
  expected: Expected
): boolean {
  const varName =
    el.element.kind === 'scope_var' && typeof el.element.name === 'string'
      ? el.element.name
      : undefined;
  const fullPath =
    varName !== undefined
      ? prefix
        ? `${prefix}.${varName}`
        : varName
      : prefix;
  const subscope = isSubscopeVar(el);
  if (
    varName !== undefined &&
    !subscope &&
    el.value !== undefined &&
    isMismatch(expectedValue(expected, fullPath), el.value)
  ) {
    return true;
  }
  const childPrefix = varName !== undefined && subscope ? fullPath : prefix;
  const children = Array.isArray(el.trace) ? el.trace : [];
  return children.some((c) => subtreeHasMismatch(c, childPrefix, expected));
}

// -- Components ---------------------------------------------------------------

export default function TraceTreeView({
  trace,
  filter,
  cwd,
  expand,
  test,
}: {
  trace: TraceElement[];
  filter?: string;
  cwd?: string;
  expand?: ExpandCommand | null;
  test?: TraceTest;
}): ReactElement {
  const intl = useIntl();

  const filteredTrace = trace.filter((elt) => elt.element.kind !== 'function_call');
  const roots =
    filteredTrace.length === 1 &&
    filteredTrace[0].element.kind === 'scope_call' &&
    Array.isArray(filteredTrace[0].trace)
      ? filteredTrace[0].trace
      : filteredTrace;

  if (roots.length === 0) {
    return (
      <p style={{ color: 'var(--vscode-descriptionForeground)' }}>
        <FormattedMessage id="trace.empty" />
      </p>
    );
  }

  const f = (filter ?? '').trim().toLowerCase();
  const anyVisible = f ? roots.some((el) => subtreeMatches(el, f, intl)) : true;
  if (!anyVisible) {
    return (
      <p style={{ color: 'var(--vscode-descriptionForeground)' }}>
        <FormattedMessage id="trace.noMatches" />
      </p>
    );
  }

  // The tree only highlights internal variables (by full path); outputs are
  // checked separately in the data panel against the scope call's result.
  const expected: Expected | null =
    test !== undefined ? { variables: test.variables } : null;

  return (
    <CwdContext.Provider value={cwd ?? ''}>
      <ExpandContext.Provider value={expand ?? null}>
        <ExpectedContext.Provider value={expected}>
          <ul style={rootListStyle}>
            {roots.map((el, i) => (
              <TraceNode key={i} te={el} depth={0} filter={f} prefix="" />
            ))}
          </ul>
        </ExpectedContext.Provider>
      </ExpandContext.Provider>
    </CwdContext.Provider>
  );
}

function TraceNode({
  te,
  depth,
  filter,
  prefix,
}: {
  te: TraceElement;
  depth: number;
  filter?: string;
  prefix?: string;
}): ReactElement | null {
  // filter input exceptions
  if (te.element.kind==='exception' && depth===1) { return null }

  const f = filter ?? '';
  const filtering = f.length > 0;
  const expected = useContext(ExpectedContext);
  const intl = useIntl();

  const singleLinePos =
    te.element.kind !== 'scope_var' && isSingleLine(te.pos)
      ? te.pos
      : undefined;

  // For a fulfilled definition (exception), show its consequence location too,
  // mirroring `Print.trace_element` in the compiler.
  const fulfilled =
    te.element.kind === 'exception' &&
    te.value?.kind === 'bool' &&
    te.value.value === true;
  const consPos = fulfilled ? asCodeLocation(te.element.cons_pos) : undefined;
  const consSingleLine = isSingleLine(consPos) ? consPos : undefined;

  // A subscope variable whose only child is the scope call: collapse that level
  // and process the scope call's children directly.
  const [te2, isMerged]: [TraceElement, boolean] =
    te.element.kind === 'scope_var' &&
    Array.isArray(te.trace) &&
    te.trace.length === 1 &&
    te.trace[0].element.kind === 'scope_call'
      ? [te.trace[0], true]
      : [te, false];

  const children = te2.trace ?? [];
  const hasChildren = children.length > 0;
  // Container values (structs, arrays, enum payloads) have no inline rendering
  // (`formatTraceValue` returns undefined); show them fully in the expansion.
  const containerValue =
    !isMerged &&
    te.element.kind !== 'if_branching' &&
    te.element.kind !== 'scope_call' &&
    te.value !== undefined &&
    formatTraceValue(te.value) === undefined
      ? formatTraceValue(te.value, true)
      : undefined;
  const expandable =
    hasChildren ||
    !!singleLinePos ||
    !!consSingleLine ||
    containerValue !== undefined;
  // A node whose only expandable content is its (possibly large) container
  // value starts collapsed.
  const onlyContainerValue =
    containerValue !== undefined &&
    !hasChildren &&
    !singleLinePos &&
    !consSingleLine;

  // Expand the first couple of levels by default; assertions expand only when
  // they fail (a failed assertion carries a sub-trace), and nodes whose only
  // content is a container value stay collapsed. When a filter is applied,
  // auto-expand so the matches are visible; the user can still collapse/expand
  // freely afterwards (until the filter changes again).
  const defaultExpanded =
    te.element.kind === 'assertion'
      ? !!te.trace
      : onlyContainerValue
        ? false
        : depth < 2;
  const [expanded, setExpanded] = useState(defaultExpanded);
  useEffect(() => {
    setExpanded(filtering ? true : defaultExpanded);
  }, [f, defaultExpanded, filtering]);

  // Apply the latest expand/collapse-all command (recursively, as newly
  // revealed nodes mount and pick up the current command).
  const expandCmd = useContext(ExpandContext);
  useEffect(() => {
    if (expandCmd) {
      setExpanded(expandCmd.open);
    }
  }, [expandCmd]);

  // Auto-expand branches that contain a variable whose trace value differs
  // from the expected value declared in the test, so mismatches are visible.
  const hasMismatch =
    expected !== null && subtreeHasMismatch(te, prefix ?? '', expected);
  useEffect(() => {
    if (hasMismatch) {
      setExpanded(true);
    }
  }, [hasMismatch]);

  const open = expanded;

  // Hide this branch entirely if neither it nor any sub-trace matches.
  if (f && !subtreeMatches(te, f, intl)) {
    return null;
  }
  // If this node matches on its own, stop filtering its descendants (show the
  // whole subtree); otherwise keep pruning children to the matching paths.
  const childFilter = filtering && !selfMatches(te2, f, intl) ? f : undefined;

  const varName =
    te.element.kind === 'scope_var' && typeof te.element.name === 'string'
      ? te.element.name
      : undefined;
  const parentPath = prefix ?? '';

  const fullPath =
    varName !== undefined
      ? parentPath
        ? `${parentPath}.${varName}`
        : varName
      : parentPath;
  const subscope = isSubscopeVar(te);
  const childPrefix = varName !== undefined && subscope ? fullPath : parentPath;

  let matchBackground: string | undefined;
  if (
    varName !== undefined &&
    !subscope &&
    expected &&
    te.value !== undefined
  ) {
    const exp = expectedValue(expected, fullPath);
    if (exp !== undefined) {
      matchBackground = isMismatch(exp, te.value)
        ? 'var(--vscode-diffEditor-removedTextBackground, rgba(255, 50, 50, 0.2))'
        : 'var(--vscode-diffEditor-insertedTextBackground, rgba(35, 200, 60, 0.2))';
    }
  }

  const described: Described = isMerged
    ? {
        symbol: '→',
        label: intl.formatMessage(
          { id: 'trace.computationOf' },
          { name: str(te2.element.name) }
        ),
        tone: 'scope',
        showsValue: false,
      }
    : describe(te2.element, intl);
  // Assertions are coloured by their result: green when satisfied, red when not.
  const accentColor =
    te2.element.kind === 'assertion'
      ? !te.trace
        ? 'var(--vscode-testing-iconPassed, var(--vscode-charts-green))'
        : 'var(--vscode-errorForeground)'
      : toneColor(described.tone);
  const related =
    te2.element.kind === 'error' ? relatedLocations(te2.element) : [];

  return (
    <li style={liStyle}>
      <div
        style={{
          ...rowStyle,
          cursor: expandable ? 'pointer' : 'default',
          background: matchBackground,
        }}
        onClick={() => expandable && setExpanded((e) => !e)}
      >
        {expandable ? (
          <span
            className={`codicon codicon-chevron-${open ? 'down' : 'right'}`}
            style={chevronStyle}
          />
        ) : (
          <span style={chevronStyle} />
        )}
        <span style={{ ...symbolStyle, color: accentColor }}>
          {described.symbol}
        </span>
        <span style={{ ...labelStyle, color: accentColor }}>
          {described.label}
        </span>
        {described.detail && (
          <span style={detailStyle}>{described.detail}</span>
        )}
        <ValueView te={te} described={described} />
      </div>
      {open && (
        <div style={openContentStyle}>
          {containerValue !== undefined &&
            (onlyContainerValue ? (
              // No other content: show the value directly.
              <pre style={containerValueStyle}>{containerValue}</pre>
            ) : (
              <ContainerValue value={containerValue} />
            ))}
          {singleLinePos && <LocationExtract pos={singleLinePos} />}
          {consSingleLine && (
            <>
              <div
                style={{ ...consequenceLabelStyle, color: toneColor('branch') }}
              >
                {'⊸ '}
                <FormattedMessage id="trace.consequence" />
              </div>
              <LocationExtract pos={consSingleLine} />
            </>
          )}
          {related.length > 0 && (
            <div style={relatedStyle}>
              <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
                <FormattedMessage id="trace.relatedLocations" />
              </span>
              {related.map((r, i) => (
                <span key={i}>{formatPos(r, true)}</span>
              ))}
            </div>
          )}
          {hasChildren && (
            <ul style={childListStyle}>
              {children.map((c, i) => (
                <TraceNode
                  key={i}
                  te={c}
                  depth={depth + 1}
                  filter={childFilter}
                  prefix={childPrefix}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/** A collapsible "value" area showing a container's full formatted rendering. */
function ContainerValue({ value }: { value: string }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div
        style={containerValueLabelStyle}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className={`codicon codicon-chevron-${open ? 'down' : 'right'}`}
          style={chevronStyle}
        />
        <FormattedMessage id="trace.value" />
      </div>
      {open && <pre style={containerValueStyle}>{value}</pre>}
    </div>
  );
}

function ValueView({
  te,
  described,
}: {
  te: TraceElement;
  described: Described;
}): ReactElement | null {
  const intl = useIntl();
  // Exceptions carry a boolean "fulfilled" value even though `describe` marks
  // them `showsValue: false`, so handle them before the generic guard.
  if (te.element.kind === 'exception') {
    const fulfilled = te.value?.kind === 'bool' && te.value.value === true;
    return (
      <span
        style={{
          fontWeight: 600,
          color: fulfilled
            ? 'var(--vscode-testing-iconPassed, var(--vscode-charts-green))'
            : 'var(--vscode-charts-yellow, var(--vscode-descriptionForeground))',
        }}
      >
        <FormattedMessage
          id={fulfilled ? 'trace.fulfilled' : 'trace.notFulfilled'}
        />
      </span>
    );
  }
  if (!described.showsValue || te.value === undefined) {
    return null;
  }
  if (te.value.kind === 'absent') {
    return (
      <span style={valueStyle}>
        = {intl.formatMessage({ id: 'trace.absent' })}
      </span>
    );
  }
  const fv = formatTraceValue(te.value);
  if (fv===undefined) { return null }
  return <span style={valueStyle}>= {fv}</span>;
}

// -- Styles -------------------------------------------------------------------

const rootListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  fontFamily: 'var(--vscode-editor-font-family, monospace)',
  fontSize: 'var(--vscode-editor-font-size, 13px)',
  maxHeight: '70vh',
  overflow: 'auto',
};

const childListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  paddingLeft: 16,
  borderLeft: '1px solid var(--vscode-panel-border, transparent)',
};

const liStyle: CSSProperties = {
  margin: 0,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '1px 0',
  whiteSpace: 'nowrap',
  // Size each row to its content so the tree overflows (and the root list
  // scrolls) horizontally rather than truncating long lines.
  width: 'max-content',
  minWidth: '100%',
};

const openContentStyle: CSSProperties = {
  paddingLeft: 16,
};

const containerValueLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
  color: 'var(--vscode-descriptionForeground)',
  fontStyle: 'italic',
};

const containerValueStyle: CSSProperties = {
  margin: '2px 0 4px 22px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'var(--vscode-editor-font-family, monospace)',
  color: 'var(--vscode-debugTokenExpression-value, var(--vscode-foreground))',
};

const chevronStyle: CSSProperties = {
  display: 'inline-block',
  width: 16,
  flex: '0 0 auto',
  textAlign: 'center',
};

const symbolStyle: CSSProperties = {
  display: 'inline-block',
  width: '1.1em',
  flex: '0 0 auto',
  textAlign: 'center',
};

const labelStyle: CSSProperties = {
  fontWeight: 600,
};

const detailStyle: CSSProperties = {
  color:
    'var(--vscode-symbolIcon-variableForeground, var(--vscode-foreground))',
};

const valueStyle: CSSProperties = {
  color: 'var(--vscode-debugTokenExpression-value, var(--vscode-foreground))',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const sourceStyle: CSSProperties = {
  margin: '2px 0 4px 22px',
  padding: '2px 6px',
  background:
    'var(--vscode-textCodeBlock-background, var(--vscode-editor-background))',
  border: '1px solid var(--vscode-panel-border, transparent)',
  borderRadius: 2,
  overflowX: 'auto',
  whiteSpace: 'pre',
  cursor: 'pointer',
  fontFamily: 'var(--vscode-editor-font-family, monospace)',
};

const markStyle: CSSProperties = {
  background: 'var(--vscode-editor-findMatchHighlightBackground, yellow)',
  color: 'inherit',
  borderRadius: 2,
};

const relatedStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  margin: '2px 0 4px 22px',
  fontSize: '0.9em',
};

const consequenceLabelStyle: CSSProperties = {
  margin: '2px 0 0 22px',
  fontWeight: 600,
  fontSize: '0.9em',
};

const posLinkStyle: CSSProperties = {
  color: 'var(--vscode-textLink-foreground)',
  fontSize: '0.85em',
  marginLeft: 'auto',
  paddingLeft: 12,
  cursor: 'pointer',
  textDecoration: 'none',
};

const posLinkInlineStyle: CSSProperties = {
  color: 'var(--vscode-textLink-foreground)',
  fontSize: '0.85em',
  cursor: 'pointer',
  textDecoration: 'none',
};
