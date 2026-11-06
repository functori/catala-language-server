import { describe, it, expect } from 'vitest';
import { createIntl, createIntlCache } from 'react-intl';
import enMessages from '../src/locales/en.json';
import {
  formatTraceValue,
  inlineTraceValue,
  traceFromJson,
  type TraceValue,
} from '../src/trace-editor/traceUtils';
import type { JsonValue } from '../src/shared/util_client';

function valueOf(value: JsonValue): unknown {
  const trace = traceFromJson([{ element: { kind: 'scope_var' }, value }]);
  return trace?.[0]?.value;
}

describe('trace values', () => {
  it('reads a one-key object with a capitalized key as an enum', () => {
    expect(valueOf({ Green: '4' })).toEqual({
      kind: 'enum',
      ctor: 'Green',
      value: { kind: 'integer', value: 4 },
    });
    expect(valueOf({ Étranger: 'C_976' })).toEqual({
      kind: 'enum',
      ctor: 'Étranger',
      value: { kind: 'enum', ctor: 'C_976' },
    });
  });

  it('reads a one-key object with a lowercase key as a struct', () => {
    expect(valueOf({ amount: '4' })).toEqual({
      kind: 'struct',
      fields: { amount: { kind: 'integer', value: 4 } },
    });
  });

  it('still unwraps a present optional', () => {
    expect(valueOf({ Présent: '4' })).toEqual({ kind: 'integer', value: 4 });
  });
});

describe('enum formatting', () => {
  const intl = createIntl(
    { locale: 'en', messages: enMessages, defaultLocale: 'en' },
    createIntlCache()
  );
  const enumOf = (json: JsonValue): TraceValue => valueOf(json) as TraceValue;

  it('shows a constructor without content inline', () => {
    expect(inlineTraceValue(enumOf('C_976'), intl)).toBe('C_976');
  });

  it('shows a constructor with literal content inline', () => {
    expect(inlineTraceValue(enumOf({ Green: '4' }), intl)).toBe('Green 4');
    expect(inlineTraceValue(enumOf({ AUTRES: 'C_976' }), intl)).toBe(
      'AUTRES C_976'
    );
  });

  it('puts a constructor with compound content in the container', () => {
    const v = enumOf({ Ok: { amount: '4' } });
    expect(inlineTraceValue(v, intl)).toBeUndefined();
    expect(formatTraceValue(v, intl, 'en', true)).toBe('Ok {\n  amount: 4\n}');
  });
});
