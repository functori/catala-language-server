import { describe, it, expect } from 'vitest';
import type { JsonValue } from '../src/shared/util_client';
import {
  JsonPath,
  TraceElement,
  TraceVariable,
  traceFromJson,
  traceVariablesForTest,
  variablePath,
  withJsonPaths,
} from '../src/trace-editor/traceUtils';

// Maps every variable path to the trace element it was built from, using the
// same path construction as `findTraceValue`. Combined with
// `TraceElement.jsonPath` this is what lets a caller go from a path such as
// `taux_imposition.x.Pourcentage.narnia` back to the raw trace JSON.
function traceVariableSources(
  variables: TraceVariable[],
  prefix = '',
  acc = new Map<string, TraceElement>()
): Map<string, TraceElement> {
  for (const v of variables) {
    const path = variablePath(prefix, v);
    if (v.source !== undefined) acc.set(path, v.source);
    if (v.kind === 'step') traceVariableSources(v.variables, path, acc);
  }
  return acc;
}

// Reads the node a `jsonPath` points at, in the raw trace JSON it came from.
function jsonAtPath(root: JsonValue, path: JsonPath): JsonValue | undefined {
  let current: JsonValue | undefined = root;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = Array.isArray(current)
      ? typeof segment === 'number'
        ? current[segment]
        : undefined
      : (current as Record<string, JsonValue>)[String(segment)];
  }
  return current;
}

// A trace exercising the three transformations that make a variable path
// impossible to invert on its own:
//   - `intermediate` is not a variable node, so its child is hoisted up and
//     leaves no segment in the path;
//   - `Test` has a single step child, so both collapse into one dotted segment;
//   - the two `Sous` calls are homonyms, numbered by their rank among siblings.
const TRACE: JsonValue = [
  {
    element: { kind: 'scope_call', name: 'Test' },
    trace: [
      {
        element: { kind: 'intermediate' },
        trace: [
          {
            element: { kind: 'scope_call', name: 'CalculImpot' },
            value: { resultat: 100 },
            trace: [
              { element: { kind: 'scope_var', name: 'taux' }, value: '0.20' },
              {
                element: { kind: 'scope_call', name: 'Sous' },
                trace: [
                  { element: { kind: 'local_var', name: 'x' }, value: 1 },
                ],
              },
              {
                element: { kind: 'scope_call', name: 'Sous' },
                trace: [
                  { element: { kind: 'local_var', name: 'x' }, value: 2 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

function sourcesForTest(): {
  sources: Map<string, { jsonPath: (string | number)[] }>;
  scopePath: string;
} {
  const trace = traceFromJson(TRACE);
  expect(trace).not.toBeNull();
  const [variables, , testedScope] = traceVariablesForTest(
    trace!,
    'CalculImpot'
  );
  expect(testedScope).toBeDefined();
  return {
    sources: traceVariableSources(variables),
    scopePath: testedScope!.path,
  };
}

describe('trace variable paths → trace JSON', () => {
  it('exposes the anchor the paths are relative to', () => {
    const { scopePath } = sourcesForTest();
    // The two nodes merged into a single segment.
    expect(scopePath).toBe('Test.CalculImpot');
  });

  it('resolves a path whose parent node was flattened away', () => {
    const { sources } = sourcesForTest();
    const source = sources.get('taux');
    expect(source?.jsonPath).toEqual([0, 'trace', 0, 'trace', 0, 'trace', 0]);
    expect(jsonAtPath(TRACE, source!.jsonPath)).toMatchObject({
      element: { name: 'taux' },
    });
  });

  it('maps a duplicate step index to the right JSON node', () => {
    const { sources } = sourcesForTest();
    // `[1]` counts occurrences in the variable tree, not in the JSON: only
    // replaying the traversal — which is what `source` records — can tell that
    // it is `trace[2]` here.
    expect(jsonAtPath(TRACE, sources.get('Sous[0].x')!.jsonPath)).toMatchObject(
      {
        value: 1,
      }
    );
    expect(jsonAtPath(TRACE, sources.get('Sous[1].x')!.jsonPath)).toMatchObject(
      {
        value: 2,
      }
    );
    expect(sources.get('Sous[1]')!.jsonPath).toEqual([
      0,
      'trace',
      0,
      'trace',
      0,
      'trace',
      2,
    ]);
  });

  it('points a merged segment at the innermost node, the outer one being a prefix', () => {
    const trace = traceFromJson(TRACE)!;
    const [, , testedScope] = traceVariablesForTest(trace, 'CalculImpot');
    const inner = testedScope!.variable.source!.jsonPath;
    expect(inner).toEqual([0, 'trace', 0, 'trace', 0]);
    // `Test`, collapsed into the same segment, is an ancestor of it.
    expect(jsonAtPath(TRACE, inner.slice(0, 1))).toMatchObject({
      element: { name: 'Test' },
    });
  });

  it('rebuilds the paths of a tree serialized without them', () => {
    const trace = traceFromJson(TRACE)!;
    const stripped = JSON.parse(
      JSON.stringify(trace, (key, value) =>
        key === 'jsonPath' ? undefined : value
      )
    );
    expect(withJsonPaths(stripped)).toEqual(trace);
  });
});
