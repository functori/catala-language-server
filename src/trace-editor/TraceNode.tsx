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
import { LocationSnippet, candidatePaths } from './LocationSnippet';
import { isSelectingText } from './traceMenu';
import type { AddFilter } from './traceMenu';
import type {
  CodeLocation,
  Described,
  TraceElement,
  TraceKind,
  Tone,
} from './traceUtils';
import {
  dependenciesOf,
  describeKind,
  filterMatches,
  elementCodeSpan,
  formatTraceValue,
  inlineTraceValue,
  stepPath,
  nodeMatchState,
  posText,
  subtreeHasMismatch,
  subtreeMatches,
} from './traceUtils';
import {
  CwdContext,
  DependenciesContext,
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
    case 'input':
      return 'var(--vscode-charts-yellow)';
    case 'context':
      return 'var(--vscode-terminal-ansiCyan)';
    case 'output':
      return 'var(--vscode-charts-orange)';
    case 'local':
      return 'var(--vscode-descriptionForeground)';
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
      files: candidatePaths(cwd, pos.file),
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

export default function TraceNode({
  te,
  depth,
  filters,
  prefix,
  tested_scope,
  addFilter,
}: {
  te: TraceElement;
  depth: number;
  filters: Filter[];
  prefix: string;
  tested_scope?: string;
  addFilter: AddFilter;
}): ReactElement | null {
  const [showValue, setShowValue] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [showConsequence, setShowConsequence] = useState(false);
  const [showDependencies, setShowDependencies] = useState(false);
  const graphs = useContext(DependenciesContext);
  const cwd = useContext(CwdContext);

  const filtering = filters.length > 0;
  const filterKey = filters.map((f) => `${f.option}:${f.filter}`).join('\n');
  const expected = useContext(ExpectedContext);
  const stepIndices = useContext(IndexContext);
  const intl = useIntl();
  const defaultExpanded = depth < 2;
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
  const step = stepPath(te, { prefix, testedScope: tested_scope }, stepIndices);
  const childPrefix = step.prefix;
  const testedScope = step.testedScope;
  const hasMismatch =
    expected !== null && subtreeHasMismatch(te, step, expected, stepIndices);
  useEffect(() => {
    if (hasMismatch) {
      setExpanded(true);
    }
  }, [hasMismatch]);
  const open = expanded;
  if (filtering && !subtreeMatches(te, filters, intl)) {
    return null;
  }
  const [childFilters] = filtering ? filterMatches(te, filters, intl) : [[]];
  let matchBackground: string | undefined;
  if (
    expected &&
    tested_scope === undefined &&
    te.value !== undefined &&
    (te.element.kind === 'scope_var' || te.element.kind === 'local_var') &&
    typeof te.element.name === 'string'
  ) {
    const state = nodeMatchState(expected, step.prefix, te.value);
    if (state !== undefined) {
      matchBackground =
        state === 'mismatch'
          ? 'var(--vscode-diffEditor-removedTextBackground, rgba(255, 50, 50, 0.2))'
          : 'var(--vscode-diffEditor-insertedTextBackground, rgba(35, 200, 60, 0.2))';
    }
  }
  const described: Described = describeKind(te.element, intl);
  const snippetPos = described.showsCode
    ? (te.codeSpan ?? elementCodeSpan(te))
    : undefined;
  const accentColor =
    te.element.kind === 'assertion'
      ? !te.trace
        ? 'var(--vscode-testing-iconPassed, var(--vscode-charts-green))'
        : 'var(--vscode-errorForeground)'
      : toneColor(described.tone);
  const related =
    te.element.kind === 'error' ? relatedLocations(te.element) : [];
  const children = te.trace ?? [];
  const hasChildren = children.length > 0;
  const expandable = hasChildren || related.length > 0;
  const containerValue =
    te.element.kind !== 'if_branching' &&
    te.element.kind !== 'scope_call' &&
    te.value !== undefined &&
    inlineTraceValue(te.value, intl) === undefined
      ? formatTraceValue(te.value, intl, 'en', true)
      : undefined;
  const dependencies = dependenciesOf(graphs, te, cwd);
  const consPos =
    te.element.kind === 'exception' &&
    te.value?.kind === 'bool' &&
    te.value.value === true
      ? asCodeLocation(te.element.cons_pos)
      : undefined;
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
        {(containerValue !== undefined ||
          snippetPos !== undefined ||
          dependencies.length > 0 ||
          consPos) && (
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
            {dependencies.length > 0 && (
              <Pill
                labelId="trace.dependencies"
                active={showDependencies}
                onToggle={() => setShowDependencies((v) => !v)}
              />
            )}
            {consPos && (
              <Pill
                labelId="trace.consequence"
                active={showConsequence}
                onToggle={() => setShowConsequence((v) => !v)}
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
      {showDependencies && dependencies.length > 0 && (
        <div style={openContentStyle}>
          <div style={dependencyListStyle}>
            {dependencies.map((d) => (
              <span
                key={d}
                style={dependencyPillStyle}
                title={intl.formatMessage(
                  { id: 'trace.filterOn' },
                  { name: d }
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  addFilter(d);
                }}
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      )}
      {showCode && snippetPos && (
        <div style={openContentStyle}>
          <LocationSnippet pos={snippetPos} filters={filters} />
        </div>
      )}
      {showConsequence && consPos && (
        <div style={openContentStyle}>
          <LocationSnippet pos={consPos} filters={filters} />
        </div>
      )}
      {open && expandable && (
        <div style={openContentStyle}>
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
                  addFilter={addFilter}
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
  const fv = inlineTraceValue(te.value, intl);
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

const childListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  paddingLeft: 8,
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
  paddingLeft: 8,
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

const dependencyListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  margin: '2px 0 4px 22px',
};

const dependencyPillStyle: CSSProperties = {
  cursor: 'pointer',
  userSelect: 'none',
  fontFamily: 'var(--vscode-editor-font-family, monospace)',
  padding: '1px 8px',
  borderRadius: 4,
  border: '1px solid var(--vscode-widget-border, transparent)',
  background: 'var(--vscode-editorWidget-background)',
  color: 'var(--vscode-foreground)',
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
