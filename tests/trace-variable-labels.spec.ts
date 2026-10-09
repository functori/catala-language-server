import { describe, it, expect } from 'vitest';
import type { IntlShape } from 'react-intl';
import {
  describeKind,
  formatTraceValue,
  inlineTraceValue,
} from '../src/trace-editor/traceUtils';
import type { TraceKind } from '../src/trace-editor/traceUtils';

// Echo the message id back, so assertions read as the key that was picked.
const intl = {
  formatMessage: ({ id }: { id: string }) => id,
} as unknown as IntlShape;

const label = (kind: TraceKind): string => describeKind(kind, intl).label;

const scopeVar = (input: string, output: boolean): TraceKind =>
  ({ kind: 'scope_var', name: 'v', input, output }) as unknown as TraceKind;

describe('scope variable labels', () => {
  it('distinguishes the four variable flavours', () => {
    expect(label(scopeVar('only_input', false))).toBe(
      'trace.kind.scopeInputVariable'
    );
    expect(label(scopeVar('reentrant', false))).toBe(
      'trace.kind.scopeContextVariable'
    );
    expect(label(scopeVar('no_input', true))).toBe(
      'trace.kind.scopeOutputVariable'
    );
    expect(label(scopeVar('no_input', false))).toBe('trace.kind.scopeVariable');
    expect(label({ kind: 'local_var', name: 'v' } as TraceKind)).toBe(
      'trace.kind.localVariable'
    );
  });

  it('lets input and context win over output, which they compose with', () => {
    // `input output x` and `context output x` are both legal declarations;
    // the input qualifier is the more informative one to show.
    expect(label(scopeVar('only_input', true))).toBe(
      'trace.kind.scopeInputVariable'
    );
    expect(label(scopeVar('reentrant', true))).toBe(
      'trace.kind.scopeContextVariable'
    );
  });

  it('treats a missing output flag as internal, not output', () => {
    expect(
      label({ kind: 'scope_var', name: 'v', input: 'no_input' } as TraceKind)
    ).toBe('trace.kind.scopeVariable');
  });

  it('still hides the code pill only for pure inputs', () => {
    expect(describeKind(scopeVar('only_input', false), intl).showsCode).toBe(
      false
    );
    expect(describeKind(scopeVar('no_input', true), intl).showsCode).toBe(true);
    expect(describeKind(scopeVar('no_input', false), intl).showsCode).toBe(
      true
    );
  });
});

describe('empty list values', () => {
  const empty = { kind: 'array', values: [] } as const;
  const full = {
    kind: 'array',
    values: [[{ kind: 'integer', value: 1 }, undefined]],
  } as const;

  it('reads an empty list inline in the trace tree, so it needs no pill', () => {
    expect(inlineTraceValue(empty, intl)).toBe('[]');
  });

  it('still defers a non-empty list to the expandable view', () => {
    expect(inlineTraceValue(full, intl)).toBeUndefined();
    expect(formatTraceValue(full, intl, 'en', true)).toContain('1');
  });

  it('leaves formatTraceValue alone, so containers stay hidden elsewhere', () => {
    // The data panel and the expected-variables editor use this undefined to
    // omit arrays and structs entirely; an empty list must not slip through.
    expect(formatTraceValue(empty, intl)).toBeUndefined();
    expect(formatTraceValue(full, intl)).toBeUndefined();
    expect(
      formatTraceValue({ kind: 'struct', fields: {} }, intl)
    ).toBeUndefined();
  });

  it('is unchanged when the whole value is requested', () => {
    expect(formatTraceValue(empty, intl, 'en', true)).toBe('[]');
  });
});

describe('variable tones', () => {
  const tone = (kind: TraceKind): string => describeKind(kind, intl).tone;

  it('gives each scope variable flavour its own tone', () => {
    expect(tone(scopeVar('only_input', false))).toBe('input');
    expect(tone(scopeVar('reentrant', false))).toBe('context');
    expect(tone(scopeVar('no_input', true))).toBe('output');
  });

  it('leaves internal variables plain, so the others stand out', () => {
    expect(tone(scopeVar('no_input', false))).toBe('plain');
  });

  it('dims locals', () => {
    expect(tone({ kind: 'local_var', name: 'v' } as TraceKind)).toBe('local');
    expect(
      tone({
        kind: 'local_tup',
        names: [{ name: 'a' }],
      } as unknown as TraceKind)
    ).toBe('local');
  });

  it('does not disturb the tones that already carry meaning', () => {
    expect(tone({ kind: 'scope_call', name: 'S' } as TraceKind)).toBe('scope');
    expect(tone({ kind: 'function_call', name: 'f' } as TraceKind)).toBe(
      'scope'
    );
    expect(tone({ kind: 'if_branching' } as TraceKind)).toBe('branch');
    expect(tone({ kind: 'branch_condition' } as TraceKind)).toBe('branch');
    expect(tone({ kind: 'match_branching' } as TraceKind)).toBe('branch');
  });
});
