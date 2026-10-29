import { FormattedMessage } from 'react-intl';
import type { Step } from 'react-joyride';
import { placeChapters } from '../shared/Tutorial';
import type { Chapter } from '../shared/Tutorial';
// The guided tour of the 'debug all tests' panel.

// -- Tutorial -----------------------------------------------------------------
// Most targets only exist once a trace has run, or for a scope that has a test:
// Joyride skips the steps whose target is missing.

const tutoStep = (
  id: string,
  target: Step['target'],
  extra?: Partial<Step>
): Step => ({ id, content: <FormattedMessage id={id} />, target, ...extra });

// The first pill of this kind in the tree: a pill only exists for the rows it
// applies to (a compound value, a position in the code), so looking for the
// pill itself finds one whenever the trace has any. One of an internal
// variable first, which usually sits in the middle of the trace, then one of
// any row, for the traces without internal variables. With none, there is
// nothing to explain and Joyride skips the step.
const treePill = (labelId: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(
    `.trace-tree .internal [data-pill="${labelId}"]`
  ) ??
  document.querySelector<HTMLElement>(`.trace-tree [data-pill="${labelId}"]`);

// Opens or closes the pill, as a click on it would.
const clickOnPill =
  (labelId: string, wantActive: boolean) => async (): Promise<void> => {
    const pill = treePill(labelId);
    if (pill !== null && pill.dataset.active !== `${wantActive}`) {
      pill.click();
      // Lets React render what the pill opens before the step is placed.
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  };

// The pill is opened before its step is shown, so that the step shows what it
// opens, and closed after it.
function tutoPillStep(id: string, labelId: string): Step {
  return tutoStep(id, () => treePill(labelId), {
    placement: 'top',
    // Above, even with too little room at first: Joyride would flip it below.
    floatingOptions: { flipOptions: false },
    before: clickOnPill(labelId, true),
    after: clickOnPill(labelId, false),
  });
}

// The name of an internal variable, a likely text to filter on, is selected
// for the user to right-click it: the menu is the one of VS Code, outside of
// the page, which the tutorial can neither open nor point at.
const treeLabel = '.trace-tree .internal .trace-node-label';

const tutoSelectionStep: Step = tutoStep('trace.tuto.selection', treeLabel, {
  placement: 'left',
  // The right click must go through.
  blockTargetInteraction: false,
  before: async () => {
    const label = document.querySelector(treeLabel);
    if (label !== null) {
      window.getSelection()?.selectAllChildren(label);
    }
  },
  after: async () => {
    window.getSelection()?.removeAllRanges();
  },
});

// The slider, with the panes in the layout the step shows.
const tutoLayoutStep = (id: string, layout: string): Step =>
  tutoStep(id, '.trace-layout-slider', { data: { layout } });

const tutoWelcome: Step[] = [
  // The message invites to open the menu: the click must go through.
  tutoStep('trace.tuto.welcome', '.tuto-menu', {
    blockTargetInteraction: false,
  }),
];

export const tutoChapters = placeChapters(
  [
    {
      title: 'trace.tuto.chapter.toolbar',
      steps: [
        // No way back to the welcome step: the default buttons, without 'back'.
        tutoStep('trace.tuto.run', '#traceRun', {
          buttons: ['close', 'primary'],
        }),
        tutoStep('trace.tuto.openGui', '#traceOpenGui'),
        tutoStep('trace.tuto.copyJson', '#traceCopyJson'),
        tutoStep('trace.tuto.scope', '.trace-scope-select'),
        tutoLayoutStep('trace.tuto.layout.data', 'data'),
        tutoLayoutStep('trace.tuto.layout.trace', 'trace'),
        tutoLayoutStep('trace.tuto.layout.both', 'both'),
      ],
    },
    {
      title: 'trace.tuto.chapter.data',
      steps: [
        tutoStep('trace.tuto.data', '.trace-data-panel', {
          placement: 'right',
        }),
        tutoStep('trace.tuto.sections', '.trace-section-header'),
        tutoStep('trace.tuto.expected', '.trace-data-expected'),
        tutoStep('trace.tuto.value', '.trace-data-value'),
        tutoStep('trace.tuto.edit', '.trace-data-edit'),
      ],
    },
    {
      title: 'trace.tuto.chapter.trace',
      steps: [
        tutoStep('trace.tuto.filter', '.trace-filter'),
        tutoStep('trace.tuto.expand', '.trace-expand-coll'),
        // On the left, over the data panel: the tree reaches down to the bottom
        // of the view, which leaves no room for the tooltip above or below it.
        tutoStep('trace.tuto.tree', '.trace-tree', { placement: 'left' }),
        // The kinds of the variables of a scope, on the first row of each.
        tutoStep('trace.tuto.varInput', '.trace-tree .input', {
          placement: 'left',
        }),
        tutoStep('trace.tuto.varInternal', '.trace-tree .internal', {
          placement: 'left',
        }),
        tutoStep('trace.tuto.varOutput', '.trace-tree .expanded .output', {
          placement: 'left',
        }),
        tutoSelectionStep,
        tutoPillStep('trace.tuto.pillValue', 'trace.value'),
        tutoPillStep('trace.tuto.pillCode', 'trace.code'),
      ],
    },
  ] satisfies Chapter[],
  tutoWelcome.length
);

export const tutoSteps: Step[] = [
  ...tutoWelcome,
  ...tutoChapters.flatMap((chapter) => chapter.steps),
  // The settings are outside of the page: nothing to point at.
  tutoStep('trace.tuto.sidebar', 'body', { placement: 'center' }),
  tutoStep('trace.tuto.end', 'body', { placement: 'center' }),
];
