import { describe, it, expect } from 'vitest';
import { flattenHiddenKinds } from '../src/trace-editor/traceUtils';
import type { TraceElement } from '../src/trace-editor/traceUtils';
import {
  TRACE_VIEW_KINDS,
  defaultSettings,
  readSettings,
  showsTraceKind,
} from '../src/shared/settings';

const node = (kind: string, trace?: TraceElement[]): TraceElement => ({
  element: { kind, name: kind },
  ...(trace === undefined ? {} : { trace }),
});

const kinds = (trace: TraceElement[]): unknown =>
  trace.map((e) =>
    e.trace === undefined
      ? e.element.kind
      : { [e.element.kind as string]: kinds(e.trace) }
  );

const hide =
  (...hidden: string[]) =>
  (kind: string): boolean =>
    !hidden.includes(kind);

describe('flattenHiddenKinds', () => {
  it('keeps everything when nothing is hidden', () => {
    const trace = [
      node('scope_call', [node('if_branching', [node('scope_var')])]),
    ];
    expect(kinds(flattenHiddenKinds(trace, () => true))).toEqual(kinds(trace));
  });

  it('splices a hidden element’s subtrace in its place', () => {
    const trace = [
      node('scope_call', [
        node('if_branching', [node('scope_var'), node('local_var')]),
      ]),
    ];
    expect(kinds(flattenHiddenKinds(trace, hide('if_branching')))).toEqual([
      { scope_call: ['scope_var', 'local_var'] },
    ]);
  });

  it('drops a hidden leaf entirely, since it has nothing to splice', () => {
    const trace = [node('scope_call', [node('assertion'), node('scope_var')])];
    expect(kinds(flattenHiddenKinds(trace, hide('assertion')))).toEqual([
      { scope_call: ['scope_var'] },
    ]);
  });

  it('collapses hidden elements nested in hidden elements', () => {
    const trace = [
      node('scope_call', [
        node('if_branching', [node('branch_condition', [node('scope_var')])]),
      ]),
    ];
    const shows = hide('if_branching', 'branch_condition');
    expect(kinds(flattenHiddenKinds(trace, shows))).toEqual([
      { scope_call: ['scope_var'] },
    ]);
  });

  it('hides elements at the root too', () => {
    const trace = [
      node('function_call', [node('scope_var')]),
      node('scope_call'),
    ];
    expect(kinds(flattenHiddenKinds(trace, hide('function_call')))).toEqual([
      'scope_var',
      'scope_call',
    ]);
  });

  it('does not invent a subtrace for a leaf it keeps', () => {
    const [kept] = flattenHiddenKinds([node('scope_var')], () => true);
    expect(kept.trace).toBeUndefined();
  });
});

describe('showsTraceKind', () => {
  it('is true by default for every optional kind', () => {
    for (const kind of TRACE_VIEW_KINDS) {
      expect(showsTraceKind(defaultSettings, kind)).toBe(true);
    }
  });

  it('is always true for scopes and variables, which have no setting', () => {
    const allOff = readSettings({
      traceView: Object.fromEntries(TRACE_VIEW_KINDS.map((k) => [k, false])),
    });
    for (const kind of ['scope_call', 'scope_var', 'local_var', 'local_tup']) {
      expect(showsTraceKind(allOff, kind)).toBe(true);
    }
    expect(showsTraceKind(allOff, 'assertion')).toBe(false);
  });
});

describe('readSettings', () => {
  it('fills in missing trace-view keys with their default', () => {
    const s = readSettings({ language: 'fr', traceView: { assertion: false } });
    expect(s.language).toBe('fr');
    expect(s.traceView.assertion).toBe(false);
    expect(s.traceView.function_call).toBe(true);
  });

  it('ignores non-boolean values', () => {
    const s = readSettings({ traceView: { assertion: 'nope' } });
    expect(s.traceView.assertion).toBe(true);
  });

  it('survives a missing or malformed traceView section', () => {
    expect(readSettings({}).traceView).toEqual(defaultSettings.traceView);
    expect(readSettings({ traceView: null }).traceView).toEqual(
      defaultSettings.traceView
    );
  });
});
