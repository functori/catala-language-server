import { describe, it, expect } from 'vitest';
import { traceFromJson } from '../src/trace-editor/traceUtils';
import type { TraceElement } from '../src/trace-editor/traceUtils';

// The shapes the patched runtime emits for local bindings.
const localVar = {
  element: {
    kind: 'local_var',
    name: 'first',
    decl_pos: {
      file: 'f.catala_en',
      start: { line: 60, character: 9 },
      end: { line: 60, character: 14 },
    },
  },
  pos: {
    file: 'f.catala_en',
    start: { line: 60, character: 22 },
    end: { line: 60, character: 31 },
  },
};

const localTup = {
  element: {
    kind: 'local_tup',
    names: [
      {
        name: 'a',
        decl_pos: {
          file: 'f.catala_en',
          start: { line: 7, character: 10 },
          end: { line: 7, character: 11 },
        },
      },
      {
        name: 'b',
        decl_pos: {
          file: 'f.catala_en',
          start: { line: 7, character: 13 },
          end: { line: 7, character: 14 },
        },
      },
    ],
  },
  pos: {
    file: 'f.catala_en',
    start: { line: 8, character: 7 },
    end: { line: 8, character: 15 },
  },
};

describe('local binding positions survive traceFromJson', () => {
  it('keeps decl_pos distinct from pos for a local variable', () => {
    const [el] = traceFromJson([localVar] as never) as TraceElement[];
    expect(el.pos?.start.line).toBe(60);
    expect(el.pos?.start.character).toBe(22);
    const decl = el.element.decl_pos;
    expect(decl?.start.character).toBe(9);
    expect(decl?.end.character).toBe(14);
  });

  it('keeps a position per name for a local tuple', () => {
    const [el] = traceFromJson([localTup] as never) as TraceElement[];
    const names = el.element.names as { name: string; decl_pos: unknown }[];
    expect(names.map((n) => n.name)).toEqual(['a', 'b']);
    expect(names.every((n) => n.decl_pos !== undefined)).toBe(true);
    // the bound expression is on the next line, and stays separate
    expect(el.pos?.start.line).toBe(8);
  });
});
