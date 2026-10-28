import { useState, type ReactElement } from 'react';
import { FormattedMessage, type IntlShape, useIntl } from 'react-intl';
import type { Controls, Locale, Options, State, Step } from 'react-joyride';

// The guided tours of the webviews, built on Joyride: a tour is cut into
// chapters, which the menu shown during the tour jumps to.

export type Chapter = { title: string; steps: Step[] };
export type PlacedChapter = Chapter & { start: number };

/** [chapters] with the index of their first step in the tour, which has
 *  [offset] steps before them (the welcome ones, which are not a chapter). */
export function placeChapters(
  chapters: Chapter[],
  offset: number
): PlacedChapter[] {
  return chapters.map((chapter, index, all) => ({
    ...chapter,
    start: all
      .slice(0, index)
      .reduce((n, { steps }) => n + steps.length, offset),
  }));
}

// Pinned to the top or bottom left corner and drawn over Joyride's overlay
// (which sits at 100), so that it stays reachable and moves nothing on the
// page. The menu never grows past this height (in pixels, from the edge of the
// view), so that Joyride can scroll the targets below it without measuring it.
const TUTO_MENU_TOP = 12;
const TUTO_MENU_MAX_HEIGHT = 120;

/** Options shared by the tours. Joyride scrolls a target this far from the
 *  top of the view: below the unfolded tutorial menu, plus Joyride's own
 *  default margin of 20px. */
export const tutoOptions: Partial<Options> = {
  skipBeacon: true,
  blockTargetInteraction: true,
  scrollOffset: TUTO_MENU_TOP + TUTO_MENU_MAX_HEIGHT + 20,
};

export function tutoLocale(intl: IntlShape): Locale {
  return {
    back: intl.formatMessage({ id: 'generalTests.tuto.button.back' }),
    close: intl.formatMessage({ id: 'generalTests.tuto.button.close' }),
    last: intl.formatMessage({ id: 'generalTests.tuto.button.last' }),
    next: intl.formatMessage({ id: 'generalTests.tuto.button.next' }),
    skip: intl.formatMessage({ id: 'generalTests.tuto.button.skip' }),
  };
}

export function TutoMenu({
  state,
  controls,
  chapters,
  corner = 'top',
}: {
  state: State;
  controls: Controls;
  chapters: PlacedChapter[];
  /** The left corner of the view the menu is pinned to. */
  corner?: 'top' | 'bottom';
}): ReactElement {
  const intl = useIntl();
  // Folded, only the icon is left, so that the menu does not hide the element
  // a step points at. The tour starts folded: the menu is there for those who
  // look for it.
  const [folded, setFolded] = useState<boolean>(true);
  // The whole of the folded menu is the button, border included; unfolded, the
  // title row is, so that clicking a chapter does not fold it.
  const toggle = {
    role: 'button',
    title: intl.formatMessage({
      id: folded
        ? 'generalTests.tooltip.unfoldTutoMenu'
        : 'generalTests.tooltip.foldTutoMenu',
    }),
    onClick: (event: React.MouseEvent): void => {
      event.preventDefault();
      setFolded((previous) => !previous);
    },
  };
  return (
    <div
      className={`tuto-menu ${folded ? 'folded' : ''}`}
      style={{ [corner]: TUTO_MENU_TOP, maxHeight: TUTO_MENU_MAX_HEIGHT }}
      {...(folded ? toggle : {})}
    >
      <div className="tuto-menu-title" {...(folded ? {} : toggle)}>
        <span className="codicon codicon-menu tuto-menu-toggle" />
        {!folded && <FormattedMessage id="generalTests.tuto.menu" />}
      </div>
      {!folded && (
        <div className="tuto-menu-items">
          {chapters.map(({ title, steps, start }) => (
            <button
              key={title}
              className={
                state.index >= start && state.index < start + steps.length
                  ? 'selected'
                  : ''
              }
              onClick={(event) => {
                event.preventDefault();
                controls.go(start);
              }}
            >
              <FormattedMessage id={title} />
            </button>
          ))}
          <button
            onClick={(event) => {
              event.preventDefault();
              controls.skip();
            }}
          >
            <span className="codicon codicon-close" />
            <FormattedMessage id="generalTests.tuto.quit" />
          </button>
        </div>
      )}
    </div>
  );
}

/** The floating button that starts the tour: partially hidden under the bottom
 *  edge of the view, it slides up on hover (see `.help-button`). */
export function HelpButton({ controls }: { controls: Controls }): ReactElement {
  const intl = useIntl();
  return (
    <button
      className="help-button"
      title={intl.formatMessage({
        id: 'generalTests.tooltip.help',
        defaultMessage: "Afficher l'aide",
      })}
      onClick={(e) => {
        e.preventDefault();
        controls.start();
      }}
    >
      <span className="codicon codicon-question" />
      <span>
        <FormattedMessage id="generalTests.help" defaultMessage="Aide" />
      </span>
    </button>
  );
}
