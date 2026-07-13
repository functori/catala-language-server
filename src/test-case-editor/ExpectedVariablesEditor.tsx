import { type ReactElement, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  VscodeButton,
  VscodeOption,
  VscodeSingleSelect,
  VscodeTextfield,
} from '@vscode-elements/react-elements';
import type { RuntimeValue, RuntimeValueRaw } from '../generated/catala_types';
import type { JsonValue } from '../shared/util_client';
import {
  type ScopeVariable,
  type TraceValue,
  formatTraceValue,
  traceValueEqual,
} from '../trace-editor/traceUtils';

type Props = {
  variables: Map<string, TraceValue>;
  scopeVariables?: ScopeVariable[] | null;
  onChange(next: Map<string, TraceValue>): void;
};

function parseAs(kind: string, s: string): TraceValue | null {
  switch (kind) {
    case 'bool':
      if (s === 'true') return { kind: 'bool', value: true };
      if (s === 'false') return { kind: 'bool', value: false };
      return null;
    case 'money':
      if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
      return { kind: 'money', value: s };
    case 'integer':
      if (!/^-?\d+$/.test(s)) return null;
      return { kind: 'integer', value: parseInt(s, 10) };
    case 'decimal': {
      const rat = /^(-?\d+)\/(\d+)$/.exec(s);
      if (rat) {
        return { kind: 'decimal', value: Number(rat[1]) / Number(rat[2]) };
      }
      if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
      return { kind: 'decimal', value: parseFloat(s) };
    }
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (!m) return null;
      return {
        kind: 'date',
        value: { year: +m[1], month: +m[2], day: +m[3] },
      };
    }
    case 'duration': {
      const m = /^(-?\d+)y\s+(-?\d+)m\s+(-?\d+)d$/.exec(s);
      if (!m) return null;
      return {
        kind: 'duration',
        value: { years: +m[1], months: +m[2], days: +m[3] },
      };
    }
    default:
      return null;
  }
}

export default function ExpectedVariablesEditor({
  variables,
  scopeVariables,
  onChange,
}: Props): ReactElement {
  const intl = useIntl();
  const addable = (scopeVariables ?? []).filter(
    (sv: ScopeVariable) => !variables.has(sv.name) && sv.value !== undefined
  );

  function computedOf(name: string): ScopeVariable | undefined {
    return (scopeVariables ?? []).find((v) => v.name === name);
  }

  function setVar(name: string, tv: TraceValue): void {
    const next = new Map(variables);
    next.set(name, tv);
    onChange(next);
  }

  function add(name: string): void {
    const tv = computedOf(name);
    if (tv !== undefined && tv.value !== undefined) {
      setVar(name, tv.value);
    }
  }

  function remove(name: string): void {
    const next = new Map(variables);
    next.delete(name);
    onChange(next);
  }

  return (
    <div className="test-section">
      <h2 className="test-section-title heading-h2">
        <FormattedMessage id="testEditor.variables" />
      </h2>
      <div className="test-inputs data-card">
        <div className="composite-editor">
          {variables.size > 0 && (
            <div className="simple-items-vertical">
              {[...variables.entries()].map(([name, tv]) => (
                <VariableRow
                  key={name}
                  name={name}
                  expected={tv}
                  computed={computedOf(name)?.value}
                  onSet={setVar}
                  onRemove={remove}
                />
              ))}
            </div>
          )}
          {addable.length > 0 && (
            <VscodeSingleSelect
              key={`add-${variables.size}`}
              value=""
              onChange={(e) => {
                const name =
                  (e.target as { value?: string } | null)?.value ?? '';
                if (name) {
                  add(name);
                }
              }}
              style={{ width: '100%' }}
            >
              <VscodeOption value="">
                {intl.formatMessage({ id: 'testEditor.addVariable' })}
              </VscodeOption>
              {addable.map((v) => {
                const label = v.value ? formatTraceValue(v.value) : undefined;
                return (
                  <VscodeOption key={v.name} value={v.name}>
                    {label ? `${v.name} = ${label}` : v.name}
                  </VscodeOption>
                );
              })}
            </VscodeSingleSelect>
          )}
        </div>
      </div>
    </div>
  );
}

function VariableRow({
  name,
  expected,
  computed,
  onSet,
  onRemove,
}: {
  name: string;
  expected: TraceValue;
  computed?: TraceValue;
  onSet(name: string, rv: TraceValue): void;
  onRemove(name: string): void;
}): ReactElement {
  const intl = useIntl();
  const [input, setInput] = useState('');

  const expectedStr = formatTraceValue(expected);
  const computedStr =
    computed !== undefined ? formatTraceValue(computed) : undefined;

  const mismatch =
    computed !== undefined && !traceValueEqual(expected, computed);

  const inputEmpty = input.trim() === '';
  const parsedInput = inputEmpty ? null : parseAs(expected.kind, input.trim());

  const disabled = inputEmpty
    ? !mismatch || computed === null
    : parsedInput === null;

  function apply(): void {
    const rvNew = inputEmpty ? computed : parsedInput;
    if (rvNew !== null && rvNew !== undefined) {
      onSet(name, rvNew);
      setInput('');
    }
  }

  return (
    <div className="simple-item-vertical atomic-element">
      <label className="item-label body-1">{name}</label>
      <div className="expected-variable-row">
        <span
          className="expected-variable-value body-1"
          style={
            mismatch ? { color: 'var(--vscode-errorForeground)' } : undefined
          }
        >
          {expectedStr}
        </span>
        <VscodeTextfield
          value={input}
          placeholder={computedStr ?? expectedStr}
          onInput={(e) =>
            setInput((e.target as { value?: string } | null)?.value ?? '')
          }
          style={{ flex: 1 }}
        />
        <VscodeButton
          secondary
          icon="check"
          disabled={disabled}
          title={intl.formatMessage(
            inputEmpty
              ? { id: 'testEditor.useComputedVariable' }
              : { id: 'testEditor.setVariable' },
            { value: inputEmpty ? (computedStr ?? '') : input.trim() }
          )}
          onClick={apply}
        />
        <VscodeButton
          secondary
          icon="trash"
          title={intl.formatMessage({ id: 'testEditor.deleteVariable' })}
          onClick={() => onRemove(name)}
        />
      </div>
    </div>
  );
}
