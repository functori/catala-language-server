import type { CSSProperties, ReactElement } from 'react';
import { FormattedMessage } from 'react-intl';
import type { RuntimeValue, TestIo } from '../generated/catala_types';
import {
  type TraceElement,
  type TraceTest,
  type TraceValue,
  scopeVariables,
  scopeCallOutputs,
  formatTraceValue,
  traceValueFromRuntime,
} from './traceUtils';

// -- Value formatting ---------------------------------------------------------

/** A flattened leaf: dotted path, formatted value, and the value's kind. */
type Leaf = { path: string; kind: string; value?: string };

/** Flatten a runtime value into `{path, value, kind}` leaves. */
function flattenValue(path: string, rv: RuntimeValue): Leaf[] {
  const raw = rv.value;
  if (raw.kind === 'Struct') {
    const [, fields] = raw.value;
    const entries = [...fields.entries()];
    if (entries.length === 0) {
      return [{ path, kind: 'struct' }];
    }
    return entries.flatMap(([field, v]) => flattenValue(`${path}.${field}`, v));
  }
  if (raw.kind === 'Array') {
    const [, ...values] = raw.value;
    if (values.length === 0) {
      return [{ path, kind: 'array' }];
    }
    return values.flatMap((v, i) => flattenValue(`${path}[${i}]`, v));
  }
  if (raw.kind === 'Enum') {
    const [, [value, opt]] = raw.value;
    if (opt === null) {
      return [{ path, kind: 'enum', value }];
    }
    return flattenValue(`${path}.${value}`, opt.value);
  }
  const value = traceValueFromRuntime(rv.value);
  return value === undefined
    ? []
    : [{ path, kind: value.kind, value: formatTraceValue(value) }];
}

function flattenIo(name: string, io: TestIo): Leaf[] {
  return io.value ? flattenValue(name, io.value.value) : [];
}

// -- Type icons ---------------------------------------------------------------

const TYPE_ICON: Record<string, string> = {
  money: '$',
  integer: '#',
  decimal: '≈',
  bool: '✓',
  date: '📅',
  duration: '⏳',
  struct: '{}',
  array: '[]',
  enum: '◆',
};

function typeIcon(kind?: string): string {
  return (kind !== undefined ? TYPE_ICON[kind] : undefined) ?? '·';
}

// -- Components ----------------------------------------------------------------

type VarRow = {
  name: string;
  expected?: string;
  value?: string;
  noExpected?: boolean;
  kind?: string;
};

export function DataPanel({
  test,
  trace,
}: {
  test: TraceTest;
  trace?: TraceElement[];
}): ReactElement {
  const scopeVars = trace !== undefined ? scopeVariables(trace) : [];
  // The tested scope's outputs are the fields of its scope call's result
  // struct; this gives the resolved values directly (no duplicate scope-var
  // occurrences from default logic).
  const actualOutputs: Map<string, TraceValue> =
    trace !== undefined
      ? scopeCallOutputs(trace, test.tested_scope.name)
      : new Map();
  const traceValue = (match: (name: string) => boolean): string | undefined => {
    const v = scopeVars.find((sv) => match(sv.name));
    return v?.value !== undefined ? formatTraceValue(v.value) : undefined;
  };

  const inputRows: VarRow[] = [...test.test_inputs.entries()].flatMap(
    ([name, io]) =>
      flattenIo(name, io).map((leaf) => ({
        name: leaf.path,
        value: leaf.value,
        noExpected: true,
      }))
  );

  const internalRows: VarRow[] = [...test.variables.entries()].map(
    ([name, expected]) => {
      return {
        name,
        expected: formatTraceValue(expected),
        value: traceValue((n) => n === name),
        kind: expected.kind,
      };
    }
  );

  const outputRows: VarRow[] = [...test.test_outputs.entries()].map(
    ([name, io]) => {
      const tv =
        io.value !== undefined
          ? traceValueFromRuntime(io.value.value.value)
          : undefined;
      const actual = actualOutputs.get(name);
      return {
        name,
        expected: tv !== undefined ? formatTraceValue(tv) : undefined,
        value: actual !== undefined ? formatTraceValue(actual) : undefined,
        kind: io.value?.value.value.kind,
      };
    }
  );

  return (
    <div style={ioPanelStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>
              <FormattedMessage id="trace.col.name" />
            </th>
            <th style={thStyle}>
              <FormattedMessage id="trace.col.expected" />
            </th>
            <th style={thStyle}>
              <FormattedMessage id="trace.col.value" />
            </th>
          </tr>
        </thead>
        <tbody>
          <SectionRow id="trace.section.inputs" />
          {inputRows.map((r, i) => (
            <VarRowView key={`in-${r.name}-${i}`} row={r} />
          ))}
          <SectionRow id="trace.section.internal" />
          {internalRows.map((r, i) => (
            <VarRowView key={`int-${r.name}-${i}`} row={r} />
          ))}
          <SectionRow id="trace.section.outputs" />
          {outputRows.map((r, i) => (
            <VarRowView key={`out-${r.name}-${i}`} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionRow({ id }: { id: string }): ReactElement {
  return (
    <tr>
      <td colSpan={3} style={sectionStyle}>
        <FormattedMessage id={id} />
      </td>
    </tr>
  );
}

function VarRowView({ row }: { row: VarRow }): ReactElement {
  const comparable =
    !row.noExpected && row.expected !== undefined && row.value !== undefined;
  // Whole-row background: green when the value matches, red when it differs.
  const background = !comparable
    ? undefined
    : row.expected === row.value
      ? 'var(--vscode-diffEditor-insertedTextBackground, rgba(35, 200, 60, 0.2))'
      : 'var(--vscode-diffEditor-removedTextBackground, rgba(255, 50, 50, 0.2))';
  return (
    <tr style={{ background }}>
      <td style={{ ...tdStyle, fontWeight: 600 }}>
        <span style={nameCellStyle}>
          <span style={typeIconStyle} title={row.kind}>
            {typeIcon(row.kind)}
          </span>
          <span>{row.name}</span>
        </span>
      </td>
      {row.noExpected ? (
        <td style={disabledCellStyle}>—</td>
      ) : (
        <td style={tdStyle}>{row.expected ?? ''}</td>
      )}
      <td style={tdStyle}>{row.value ?? ''}</td>
    </tr>
  );
}

const ioPanelStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  border: '1px solid var(--vscode-panel-border, transparent)',
  borderRadius: 2,
  fontSize: '0.9em',
  maxHeight: '70vh',
  overflow: 'auto',
};

const tableStyle: CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '1px 8px 1px 0',
  color: 'var(--vscode-descriptionForeground)',
  fontWeight: 400,
  borderBottom: '1px solid var(--vscode-panel-border, transparent)',
};

const tdStyle: CSSProperties = {
  textAlign: 'left',
  padding: '1px 8px 1px 0',
  verticalAlign: 'top',
};

const sectionStyle: CSSProperties = {
  fontWeight: 600,
  padding: '10px 0 2px',
  borderBottom: '1px solid var(--vscode-panel-border, transparent)',
};

const nameCellStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 4,
};

const typeIconStyle: CSSProperties = {
  flex: '0 0 auto',
  width: '1.1em',
  textAlign: 'center',
  color: 'var(--vscode-descriptionForeground)',
  fontWeight: 400,
};

const disabledCellStyle: CSSProperties = {
  ...tdStyle,
  color: 'var(--vscode-descriptionForeground)',
  opacity: 0.5,
  textAlign: 'center',
};
