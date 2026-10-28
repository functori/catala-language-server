import { FormattedMessage } from 'react-intl';
import type { Step } from 'react-joyride';
import { placeChapters } from '../shared/Tutorial';
import type { Chapter } from '../shared/Tutorial';
// The guided tour of the 'debug all tests' panel.

// -- Tutorial -----------------------------------------------------------------
// Most targets only exist once a trace has run, or for a scope that has a test:
// Joyride skips the steps whose target is missing.

const tutoStep = (id: string, target: string, extra?: Partial<Step>): Step => ({
  id,
  content: <FormattedMessage id={id} />,
  target,
  ...extra,
});

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
      ],
    },
  ] satisfies Chapter[],
  tutoWelcome.length
);

export const tutoSteps: Step[] = [
  ...tutoWelcome,
  ...tutoChapters.flatMap((chapter) => chapter.steps),
  tutoStep('trace.tuto.end', 'body', { placement: 'center' }),
];
