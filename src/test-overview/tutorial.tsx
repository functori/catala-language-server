import { FormattedMessage } from 'react-intl';
import type { Step } from 'react-joyride';

import { placeChapters, type PlacedChapter } from '../shared/Tutorial';

// The guided tour of the 'debug all tests' panel.

const stepsWelcome: Step[] = [
  {
    id: 'welcome',
    content: <FormattedMessage id="generalTests.tuto.welcome" />,
    target: '.tuto-menu',
    // The message invites to open the menu: the click must go through.
    blockTargetInteraction: false,
  },
];

const stepsButton: Step[] = [
  {
    id: 'test_add',
    content: <FormattedMessage id="generalTests.tuto.addTest" />,
    target: '#addTest',
    // No way back to the welcome step: the default buttons, without 'back'.
    buttons: ['close', 'primary'],
  },
  {
    id: 'tests_run',
    content: <FormattedMessage id="generalTests.tuto.runAllTests" />,
    target: '#runAllTests',
  },
];

// The welcome steps come first in the tour but are not a chapter of the menu,
// so the chapters start after them.
export const tutoChapters: PlacedChapter[] = placeChapters(
  [{ title: 'generalTests.tuto.chapter.buttons', steps: stepsButton }],
  stepsWelcome.length
);

export const tutoSteps: Step[] = [
  ...stepsWelcome,
  ...tutoChapters.flatMap((chapter) => chapter.steps),
];
