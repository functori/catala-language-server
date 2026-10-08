import { describe, it, expect } from 'vitest';
import {
  definitionLocations,
  definitionSpan,
  elementCodeSpan,
  flattenHiddenKinds,
  withCodeSpans,
} from '../src/trace-editor/traceUtils';
import type {
  CodeLocation,
  TraceElement,
} from '../src/trace-editor/traceUtils';

const at = (
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number,
  file = 'a.catala_en'
): CodeLocation => ({
  file,
  start: { line: startLine, character: startCol },
  end: { line: endLine, character: endCol },
});

/** One rule: `pos` is the condition (or the defined name), `cons_pos` the body. */
const rule = (pos: CodeLocation, consPos?: CodeLocation): TraceElement =>
  ({
    element: { kind: 'exception', ...(consPos ? { cons_pos: consPos } : {}) },
    pos,
  }) as unknown as TraceElement;

const scopeVar = (rules: TraceElement[]): TraceElement =>
  ({
    element: { kind: 'scope_var', name: 'v', input: 'no_input' },
    pos: at(5, 10, 5, 11),
    trace: rules,
  }) as unknown as TraceElement;

const span = (te: TraceElement): string | undefined => {
  const s = definitionSpan(te);
  return (
    s && `${s.start.line}:${s.start.character}-${s.end.line}:${s.end.character}`
  );
};

describe('definitionSpan', () => {
  it('covers a single unconditional definition', () => {
    expect(span(scopeVar([rule(at(99, 14, 99, 19), at(99, 27, 99, 40))]))).toBe(
      '99:14-99:40'
    );
  });

  it('covers every rule, from the earliest start to the latest end', () => {
    expect(
      span(
        scopeVar([
          rule(at(91, 5, 91, 17), at(93, 5, 93, 6)),
          rule(at(96, 5, 96, 18), at(97, 22, 97, 23)),
        ])
      )
    ).toBe('91:5-97:23');
  });

  it('does not assume the rules are in source order', () => {
    // an exception is reported before the base rule it overrides
    expect(
      span(
        scopeVar([
          rule(at(102, 5, 102, 15), at(104, 5, 104, 6)),
          rule(at(99, 14, 99, 19), at(99, 27, 99, 40)),
        ])
      )
    ).toBe('99:14-104:6');
  });

  it('orders by column when two positions share a line', () => {
    expect(
      span(
        scopeVar([
          rule(at(7, 30, 7, 40), at(7, 50, 7, 60)),
          rule(at(7, 8, 7, 12), at(7, 14, 7, 20)),
        ])
      )
    ).toBe('7:8-7:60');
  });

  it('is undefined for a variable with no rules, such as an input', () => {
    expect(definitionSpan(scopeVar([]))).toBeUndefined();
    expect(
      definitionSpan({
        element: { kind: 'scope_var', name: 'v' },
      } as unknown as TraceElement)
    ).toBeUndefined();
  });

  it('ignores children that are not rules', () => {
    const withNoise = {
      element: { kind: 'scope_var', name: 'v' },
      trace: [
        { element: { kind: 'scope_call', name: 'S' }, pos: at(1, 1, 1, 2) },
        rule(at(99, 14, 99, 19), at(99, 27, 99, 40)),
      ],
    } as unknown as TraceElement;
    expect(span(withNoise)).toBe('99:14-99:40');
  });

  it('never straddles two files', () => {
    const s = definitionSpan(
      scopeVar([
        rule(at(99, 14, 99, 19), at(99, 27, 99, 40)),
        rule(
          at(3, 1, 3, 2, 'other.catala_en'),
          at(4, 1, 4, 2, 'other.catala_en')
        ),
      ])
    );
    expect(s?.file).toBe('a.catala_en');
    expect(`${s?.start.line}-${s?.end.line}`).toBe('99-99');
  });

  it('tolerates a rule with no consequence position', () => {
    expect(span(scopeVar([rule(at(12, 3, 12, 9))]))).toBe('12:3-12:9');
  });
});

describe('definitionLocations', () => {
  it('returns the condition and the consequence of every rule', () => {
    const locs = definitionLocations(
      scopeVar([
        rule(at(91, 5, 91, 17), at(93, 5, 93, 6)),
        rule(at(96, 5, 96, 18), at(97, 22, 97, 23)),
      ])
    );
    expect(locs.map((l) => l.start.line)).toEqual([91, 93, 96, 97]);
  });
});

const codeSpan = (te: TraceElement): string | undefined => {
  const s = elementCodeSpan(te);
  return (
    s && `${s.start.line}:${s.start.character}-${s.end.line}:${s.end.character}`
  );
};

/** A scope_var whose own position already covers the `definition` keyword. */
const withDefinitionPos = (rules: TraceElement[]): TraceElement =>
  ({
    element: {
      kind: 'scope_var',
      name: 'v',
      decl_pos: at(86, 12, 86, 16),
    },
    pos: at(90, 3, 95, 18),
    trace: rules,
  }) as unknown as TraceElement;

/** An older runtime: pos and decl_pos both report the declaration. */
const withDeclarationPos = (rules: TraceElement[]): TraceElement =>
  ({
    element: { kind: 'scope_var', name: 'v', decl_pos: at(86, 12, 86, 16) },
    pos: at(86, 12, 86, 16),
    trace: rules,
  }) as unknown as TraceElement;

const twoRules = [
  rule(at(91, 5, 91, 17), at(93, 5, 93, 6)),
  rule(at(96, 5, 96, 18), at(97, 22, 97, 23)),
];

describe('elementCodeSpan', () => {
  it('widens the definition position to cover every rule', () => {
    expect(codeSpan(withDefinitionPos(twoRules))).toBe('90:3-97:23');
  });

  it('ignores a position that merely repeats the declaration', () => {
    // including it would stretch the span back up to line 86
    expect(codeSpan(withDeclarationPos(twoRules))).toBe('91:5-97:23');
  });

  it('falls back to the element position when there are no rules', () => {
    expect(codeSpan(withDefinitionPos([]))).toBe('90:3-95:18');
    expect(codeSpan(withDeclarationPos([]))).toBe('86:12-86:16');
  });

  it('covers the whole binding of a local variable, not just its value', () => {
    //     let first equals given * 3 in
    //         ^^^^^ decl_pos    ^^^^^^^^^ pos
    const local = {
      element: {
        kind: 'local_var',
        name: 'first',
        decl_pos: at(60, 9, 60, 14),
      },
      pos: at(60, 22, 60, 31),
    } as unknown as TraceElement;
    expect(codeSpan(local)).toBe('60:9-60:31');
  });

  it('covers every name a local tuple binds', () => {
    //     let (a, b) equals
    //          ^  ^
    //       (10, 20)
    const tup = {
      element: {
        kind: 'local_tup',
        names: [
          { name: 'a', decl_pos: at(7, 10, 7, 11) },
          { name: 'b', decl_pos: at(7, 13, 7, 14) },
        ],
      },
      pos: at(8, 7, 8, 15),
    } as unknown as TraceElement;
    expect(codeSpan(tup)).toBe('7:10-8:15');
  });

  it('leaves a local alone when the runtime reports no binding position', () => {
    const local = {
      element: { kind: 'local_var', name: 'first' },
      pos: at(60, 22, 60, 31),
    } as unknown as TraceElement;
    expect(codeSpan(local)).toBe('60:22-60:31');
  });
});

describe('withCodeSpans', () => {
  const scopeVarWithRule = (): TraceElement =>
    ({
      element: {
        kind: 'scope_var',
        name: 'many_lines',
        decl_pos: at(16, 12, 16, 22),
      },
      pos: at(42, 3, 42, 24),
      trace: [rule(at(42, 14, 42, 24), at(43, 5, 45, 15))],
    }) as unknown as TraceElement;

  it('records the full span before any filtering', () => {
    const [el] = withCodeSpans([scopeVarWithRule()]);
    expect(codeSpan({ ...el, codeSpan: undefined })).toBe('42:3-45:15');
    expect(
      el.codeSpan && `${el.codeSpan.start.line}-${el.codeSpan.end.line}`
    ).toBe('42-45');
  });

  it('survives hiding the very children the span came from', () => {
    const annotated = withCodeSpans([scopeVarWithRule()]);
    const [flat] = flattenHiddenKinds(annotated, (k) => k !== 'exception');
    expect(flat.trace ?? []).toEqual([]);
    // recomputing now would collapse to 42:3-42:24; the recorded span stands
    expect(`${flat.codeSpan?.start.line}-${flat.codeSpan?.end.line}`).toBe(
      '42-45'
    );
  });
});
