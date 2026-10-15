import { type ReactElement, type ReactNode } from 'react';

/** A label that does not widen its item: it is cut to the width the editor
 *  gives, and shows its full text on hover. Clicking it copies the text, since
 *  a cut name can no longer be selected by hand. The text is read from the DOM
 *  because a label may be any node, not only a string.
 */
export function Identifier({ name }: { name: string }): ReactElement {
  return (
    <span
      className="item-label-text"
      onMouseEnter={(e) => {
        e.currentTarget.title = e.currentTarget.textContent ?? '';
      }}
      onClick={(e) => {
        void navigator.clipboard.writeText(e.currentTarget.textContent ?? '');
      }}
    >
      {name}
    </span>
  );
}

/** Wraps plain-string labels in Identifier; leaves custom nodes untouched. */
export function wrapIdentifier(label: ReactNode): ReactNode {
  return typeof label === 'string' ? <Identifier name={label} /> : label;
}
