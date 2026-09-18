import {
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { JsonValue } from '../shared/util_client';
import { getVsCodeApi } from '../shared/webviewApi';
import type { TraceUpMessage } from './messages';
import { LocationSnippet, resolvePath } from './LocationSnippet';
import { isSelectingText } from './traceMenu';
import type {
  CodeLocation,
  Described,
  Expected,
  Match,
  TraceElement,
  TraceKind,
  Tone,
} from './traceUtils';
import {
  type TraceTest,
  PANEL_HEIGHT_VAR,
  closestFilterMatch,
  describeKind,
  detail,
  filterMatches,
  formatTraceValue,
  indexedSegment,
  nodeMatchState,
  posText,
  stepIndexMap,
  subtreeHasMismatch,
  subtreeMatches,
  traceValueEqual,
  traceValueFromRuntime,
  traceVariablesForTest,
} from './traceUtils';
import {
  CwdContext,
  ExpandContext,
  ExpectedContext,
  IndexContext,
} from './traceContexts';
import { FormattedMessage, useIntl } from 'react-intl';
import type { Filter } from '../FilterPin';
import { HighlightText } from '../shared/Highlight';

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

function relatedLocations(kind: TraceKind): CodeLocation[] {
  const rp = kind.related_pos;
  return Array.isArray(rp) ? (rp as unknown as CodeLocation[]) : [];
}

function isSingleLine(pos?: CodeLocation): pos is CodeLocation {
  return !!pos && pos.start.line === pos.end.line;
}

function formatPos(
  pos: CodeLocation | undefined,
  filters: Filter[],
  inline = false
): ReactElement | null {
  const text = posText(pos);
  if (!pos || !text) {
    return null;
  }
  return <PosLink pos={pos} text={text} inline={inline} filters={filters} />;
}

function PosLink({
  pos,
  text,
  filters,
  inline = false,
}: {
  pos: CodeLocation;
  text: string;
  filters: Filter[];
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
      <HighlightText filters={filters} text={text} />
    </a>
  );
}

function Pill({
  labelId,
  active,
  onToggle,
}: {
  labelId: string;
  active: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      style={active ? { ...pillStyle, ...pillActiveStyle } : pillStyle}
    >
      <FormattedMessage id={labelId} />
    </span>
  );
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

// -- Components ---------------------------------------------------------------

export default function TraceTreeView({
  trace,
  filters,
  cwd,
  expand,
  test,
  fromClosestMatch = false,
}: {
  trace: TraceElement[];
  filters?: Filter[];
  cwd?: string;
  expand?: boolean | null;
  test?: TraceTest;
  fromClosestMatch?: boolean;
}): ReactElement {
  const intl = useIntl();

  let roots: TraceElement[] = trace;
  if (test !== undefined) {
    const testingScope = trace.find(
      (te) =>
        te.element.kind === 'scope_call' &&
        typeof te.element.name === 'string' &&
        test.testing_scope == te.element.name
    );
    if (testingScope !== undefined) {
      roots = testingScope.trace ?? [];
    }
  }

  if (roots.length === 0) {
    return (
      <p style={{ color: 'var(--vscode-descriptionForeground)' }}>
        <FormattedMessage id="trace.empty" />
      </p>
    );
  }

  const f = (filters ?? [])
    .map((filter) => {
      return {
        filter: filter.filter.trim().toLowerCase(),
        option: filter.option,
      };
    })
    .filter((filter) => filter.filter.length > 0);
  const anyVisible = f ? roots.some((el) => subtreeMatches(el, f, intl)) : true;
  if (!anyVisible) {
    return (
      <p style={{ color: 'var(--vscode-descriptionForeground)' }}>
        <FormattedMessage id="trace.noMatches" />
      </p>
    );
  }

  let expected: Expected | null = null;
  let stepIndices: Map<TraceElement, number> = new Map();
  if (test !== undefined) {
    stepIndices = stepIndexMap(trace);
    const [, outputs] = traceVariablesForTest(trace, test.tested_scope.name);
    const output: Map<string, Match> = new Map();
    for (const [name, io] of test.test_outputs.entries()) {
      const exp = io?.value ? traceValueFromRuntime(io.value.value) : undefined;
      const computed = outputs[name];
      if (exp !== undefined && computed !== undefined) {
        const match = traceValueEqual(exp, computed) ? 'match' : 'mismatch';
        output.set(name, match);
      }
    }
    expected = { variables: test.variables, output };
  }

  let testedScope = test ? test.tested_scope.name : undefined;
  let rootPrefix = '';
  if (fromClosestMatch && f.length > 0) {
    const closest = closestFilterMatch(
      roots,
      f,
      intl,
      stepIndices,
      testedScope
    );
    roots = closest.roots;
    rootPrefix = closest.prefix;
    testedScope = closest.testedScope;
  }

  return (
    <CwdContext.Provider value={cwd ?? ''}>
      <ExpandContext.Provider value={expand ?? null}>
        <ExpectedContext.Provider value={expected}>
          <IndexContext.Provider value={stepIndices}>
            <ul style={rootListStyle}>
              {roots.map((el, i) => (
                <TraceNode
                  key={i}
                  te={el}
                  depth={0}
                  filters={f}
                  prefix={rootPrefix}
                  tested_scope={testedScope}
                />
              ))}
            </ul>
          </IndexContext.Provider>
        </ExpectedContext.Provider>
      </ExpandContext.Provider>
    </CwdContext.Provider>
  );
}

function TraceNode({
  te,
  depth,
  filters,
  prefix,
  tested_scope,
}: {
  te: TraceElement;
  depth: number;
  filters: Filter[];
  prefix: string;
  tested_scope?: string;
}): ReactElement | null {
  const [showValue, setShowValue] = useState(false);
  const [showCode, setShowCode] = useState(false);
  if (te.element.kind === 'exception' && depth === 1) return null;

  const filtering = filters.length > 0;
  // `filters` is a fresh array on every render, so it cannot be used as an
  // effect dependency: the effect below would re-run each time
  const filterKey = filters.map((f) => `${f.option}:${f.filter}`).join('\n');
  const expected = useContext(ExpectedContext);
  const stepIndices = useContext(IndexContext);
  const intl = useIntl();

  const singleLinePos =
    te.element.kind !== 'scope_var' && isSingleLine(te.pos)
      ? te.pos
      : undefined;

  const fulfilled =
    te.element.kind === 'exception' &&
    te.value?.kind === 'bool' &&
    te.value.value === true;
  const consPos = fulfilled ? asCodeLocation(te.element.cons_pos) : undefined;
  const consSingleLine = isSingleLine(consPos) ? consPos : undefined;

  const [node, displayName, isMerged]: [TraceElement, string, boolean] =
    te.element.kind === 'scope_var' &&
    typeof te.element.name === 'string' &&
    te.trace?.length === 1 &&
    te.trace[0].element.kind === 'scope_call' &&
    typeof te.trace[0].element.name === 'string'
      ? [te.trace[0], `${te.element.name}.${te.trace[0].element.name}`, true]
      : [te, te.element.name as string, false];

  const children = node.trace ?? [];
  const hasChildren = children.length > 0;
  const containerValue =
    te.element.kind !== 'if_branching' &&
    te.element.kind !== 'scope_call' &&
    te.value !== undefined &&
    formatTraceValue(te.value, intl) === undefined
      ? formatTraceValue(te.value, intl, 'en', true)
      : undefined;
  const onlyContainerValue =
    containerValue !== undefined &&
    !hasChildren &&
    !singleLinePos &&
    !consSingleLine;

  const defaultExpanded =
    node.element.kind === 'assertion'
      ? hasChildren
      : onlyContainerValue
        ? false
        : depth < 1;
  const [expanded, setExpanded] = useState(defaultExpanded);
  useEffect(() => {
    setExpanded(
      filters.some((f) => f.option == 'include') ? true : defaultExpanded
    );
  }, [filterKey, defaultExpanded, filtering]);

  const expandCmd = useContext(ExpandContext);
  useEffect(() => {
    if (expandCmd != null) {
      setExpanded(expandCmd);
    }
  }, [expandCmd]);

  let childPrefix: string = prefix;
  let testedScope: string | undefined = tested_scope;
  if (
    (node.element.kind === 'scope_call' ||
      node.element.kind === 'scope_var' ||
      node.element.kind === 'local_var') &&
    typeof node.element.name === 'string'
  ) {
    if (node.element.name == tested_scope) {
      testedScope = undefined;
    } else {
      const segment = indexedSegment(node, displayName, stepIndices);
      childPrefix = prefix ? `${prefix}.${segment}` : segment;
    }
  }

  const hasMismatch =
    expected !== null &&
    subtreeHasMismatch(node, childPrefix, expected, stepIndices);
  useEffect(() => {
    if (hasMismatch) {
      setExpanded(true);
    }
  }, [hasMismatch]);

  const open = expanded;

  if (filtering && !subtreeMatches(node, filters, intl)) {
    return null;
  }
  const [childFilters] = filtering ? filterMatches(node, filters, intl) : [[]];
  let matchBackground: string | undefined;
  if (
    expected &&
    node.value !== undefined &&
    (node.element.kind === 'scope_var' || node.element.kind === 'local_var') &&
    typeof node.element.name === 'string'
  ) {
    const path = prefix ? `${prefix}.${node.element.name}` : node.element.name;
    const state = nodeMatchState(expected, path, node.value);
    if (state !== undefined) {
      matchBackground =
        state === 'mismatch'
          ? 'var(--vscode-diffEditor-removedTextBackground, rgba(255, 50, 50, 0.2))'
          : 'var(--vscode-diffEditor-insertedTextBackground, rgba(35, 200, 60, 0.2))';
    }
  }

  const described: Described = isMerged
    ? {
        symbol: '→',
        label: intl.formatMessage(
          { id: 'trace.computationOf' },
          { name: `${detail(te.element.name)} (${detail(node.element.name)})` }
        ),
        tone: 'scope',
        showsValue: true,
        showsCode: true,
      }
    : describeKind(node.element, intl);
  const snippetPos = described.showsCode ? te.pos : undefined;
  const accentColor =
    node.element.kind === 'assertion'
      ? !node.trace
        ? 'var(--vscode-testing-iconPassed, var(--vscode-charts-green))'
        : 'var(--vscode-errorForeground)'
      : toneColor(described.tone);
  const related =
    node.element.kind === 'error' ? relatedLocations(node.element) : [];
  const expandable = hasChildren || !!consPos || related.length > 0;
  return (
    <li style={liStyle}>
      <div
        style={{
          ...rowStyle,
          cursor: expandable ? 'pointer' : 'default',
          background: matchBackground,
        }}
        onClick={() =>
          expandable && !isSelectingText() && setExpanded((e) => !e)
        }
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
          <HighlightText filters={filters} text={described.label} />
        </span>
        {described.detail && (
          <span style={detailStyle}>
            <HighlightText filters={filters} text={described.detail} />
          </span>
        )}
        <ValueView te={te} described={described} filters={filters} />
        {(containerValue !== undefined || snippetPos) && (
          <span style={pillsStyle}>
            {containerValue !== undefined && (
              <Pill
                labelId="trace.value"
                active={showValue}
                onToggle={() => setShowValue((v) => !v)}
              />
            )}
            {snippetPos && (
              <Pill
                labelId="trace.code"
                active={showCode}
                onToggle={() => setShowCode((v) => !v)}
              />
            )}
          </span>
        )}
      </div>
      {showValue && containerValue !== undefined && (
        <div style={openContentStyle}>
          <pre style={containerValueStyle}>{containerValue}</pre>
        </div>
      )}
      {showCode && snippetPos && (
        <div style={openContentStyle}>
          <LocationSnippet pos={snippetPos} />
        </div>
      )}
      {open && (
        <div style={openContentStyle}>
          {consPos && (
            <>
              <div
                style={{ ...consequenceLabelStyle, color: toneColor('branch') }}
              >
                {'⊸ '}
                <FormattedMessage id="trace.consequence" />
              </div>
              <LocationSnippet pos={consPos} />
            </>
          )}
          {related.length > 0 && (
            <div style={relatedStyle}>
              <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
                <FormattedMessage id="trace.relatedLocations" />
              </span>
              {related.map((r, i) => (
                <span key={i}>{formatPos(r, filters, true)}</span>
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
                  filters={childFilters}
                  prefix={childPrefix}
                  tested_scope={testedScope}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function ValueView({
  te,
  described,
  filters,
}: {
  te: TraceElement;
  described: Described;
  filters: Filter[];
}): ReactElement | null {
  const intl = useIntl();
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
        ={' '}
        <HighlightText
          filters={filters}
          text={intl.formatMessage({ id: 'trace.absent' })}
        />
      </span>
    );
  }
  const fv = formatTraceValue(te.value, intl);
  if (fv === undefined) {
    return null;
  }
  return (
    <span style={valueStyle}>
      = <HighlightText filters={filters} text={fv} />
    </span>
  );
}

// -- Styles -------------------------------------------------------------------

const rootListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  fontFamily: 'var(--vscode-editor-font-family, monospace)',
  fontSize: 'var(--vscode-editor-font-size, 13px)',
  maxHeight: `var(${PANEL_HEIGHT_VAR}, 70vh)`,
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
  width: 'max-content',
  minWidth: '100%',
};

const openContentStyle: CSSProperties = {
  paddingLeft: 16,
};

const pillsStyle: CSSProperties = {
  display: 'inline-flex',
  gap: 4,
  marginLeft: 16,
};

const pillStyle: CSSProperties = {
  cursor: 'pointer',
  userSelect: 'none',
  fontSize: '0.8em',
  padding: '0 6px',
  borderRadius: 8,
  border: '1px solid currentColor',
  color: 'var(--vscode-descriptionForeground)',
};

const pillActiveStyle: CSSProperties = {
  background: 'var(--vscode-badge-background)',
  color: 'var(--vscode-badge-foreground)',
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
