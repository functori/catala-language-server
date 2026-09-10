import type { TraceData } from '../generated/catala_types';

/**
 * Id of the DOM element a `FocusData` request points at.
 *
 * The trace editor names its target by section (`Input`/`Internal`/`Result`)
 * and dotted path. The fields of the test case editor build their `id` with
 * this function and the handler of the request resolves it with the same one,
 * so the two cannot drift apart.
 */
export function focusTargetId(data: TraceData): string {
  return `focus-${data.kind.toLowerCase()}-${data.value}`;
}
