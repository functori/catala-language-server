import type { PathSegment, TraceData } from '../generated/catala_types';

/**
 * Id of the DOM element a `FocusData` request points at.
 *
 * The trace editor names its target by section (`Input`/`Internal`/`Result`)
 * and dotted path. The fields of the test case editor build their `id` with
 * this function and the handler of the request resolves it with the same one,
 * so the two cannot drift apart.
 */
export function focusTargetId(data: TraceData, testing_scope?: string): string {
  const prefix = testing_scope !== undefined ? `${testing_scope}-` : '';
  return `${prefix}focus-${data.kind.toLowerCase()}-${data.value}`;
}

export function focusExpectedVariables(testing_scope: string): string {
  return `${testing_scope}-expected-variables`;
}

/**
 * Dotted rendering of a value path, in the spelling the rest of the editors
 * already use: struct fields and enum payloads are joined with `.`, as
 * `variablePath` does in `traceUtils` and `flattenStruct` in `tableArrayUtils`
 * (`customer.name`), and an index is appended in brackets to the segment it
 * indexes, as `variableSegment` does (`people[0].name`).
 *
 * A path starting with an index renders as `[0]…`, since there is nothing to
 * attach the brackets to; no caller builds such a path today.
 */
export function pathToString(path: PathSegment[]): string {
  return path.reduce((rendered, segment) => {
    switch (segment.kind) {
      case 'StructField':
      case 'EnumPayload':
        return rendered ? `${rendered}.${segment.value}` : segment.value;
      case 'ListIndex':
      case 'TupleIndex':
        return `${rendered}[${segment.value}]`;
    }
  }, '');
}
