import { type ReactElement, type ReactNode } from 'react';

/** A label that does not widen its item: it is cut to the width the editor
 *  gives, and shows its full text on hover. Clicking it copies the text, since
 *  a cut name can no longer be selected by hand. The text is read from the DOM
 *  because a label may be any node, not only a string.
 *
 *  With [displayName], that is what is shown, while [name] stays what is
 *  displayed on hover and copied: e.g. the last segment of a long path.
 */
export function Identifier({
  name,
  displayName,
}: {
  name: string;
  displayName?: string;
}): ReactElement {
  const fullText = (e: { currentTarget: HTMLElement }): string =>
    displayName !== undefined ? name : (e.currentTarget.textContent ?? '');
  return (
    <span
      className="item-label-text"
      onMouseEnter={(e) => {
        e.currentTarget.title = fullText(e);
      }}
      onClick={(e) => {
        void navigator.clipboard.writeText(fullText(e));
      }}
    >
      {displayName ?? name}
    </span>
  );
}

/** Wraps plain-string labels in Identifier; leaves custom nodes untouched. */
export function wrapIdentifier(label: ReactNode): ReactNode {
  return typeof label === 'string' ? <Identifier name={label} /> : label;
}
