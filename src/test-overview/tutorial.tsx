import { type ReactElement } from 'react';
import { FormattedMessage, type IntlShape, useIntl } from 'react-intl';
import type { Step } from 'react-joyride';

import { FilterPins, type Filter } from '../FilterPin';
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

function stepsFilter(intl: IntlShape): Step[] {
  const filterIncludeId = `#include-${intl.formatMessage({ id: 'generalTests.tuto.pinSample' })}`;
  const filterExcludeId = `#exclude-${intl.formatMessage({ id: 'generalTests.tuto.pinSample' })}`;
  const filterIgnoreId = `#ignore-${intl.formatMessage({ id: 'generalTests.tuto.pinSample' })}`;
  return [
    {
      id: 'filter_box',
      content: <FormattedMessage id="generalTests.tuto.filterBox" />,
      target: '.box-filter',
    },
    {
      id: 'filter_reset',
      content: <FormattedMessage id="generalTests.tuto.filterReset" />,
      target: '.reset-filters',
    },
    {
      id: 'filter_gui',
      content: <FormattedMessage id="generalTests.tuto.filterGUI" />,
      target: '#filter-gui',
    },
    {
      id: 'filter_scope',
      content: <FormattedMessage id="generalTests.tuto.filterScope" />,
      target: '#scopePins',
    },
    {
      id: 'filter_search',
      content: <FormattedMessage id="generalTests.tuto.filterSearch" />,
      target: '#filterPins',
    },
    {
      id: 'filter_pin_include',
      content: <PinStep option="include" />,
      target: filterIncludeId,
    },
    {
      id: 'filter_pin_exclude',
      content: <PinStep option="exclude" />,
      target: filterExcludeId,
    },
    {
      id: 'filter_pin_ignore',
      content: <PinStep option="ignore" />,
      target: filterIgnoreId,
    },
  ];
}

const stepsTests: Step[] = [
  {
    id: 'tests_display',
    content: <FormattedMessage id="generalTests.tuto.displayMode" />,
    target: '#displayMode',
    placement: 'top',
  },
];

export function samplePins(intl: IntlShape): Filter[] {
  const includeExemple: Filter = {
    filter: intl.formatMessage({ id: 'generalTests.tuto.pinSample' }),
    option: 'include',
  };
  const excludeExemple: Filter = {
    filter: intl.formatMessage({ id: 'generalTests.tuto.pinSample' }),
    option: 'exclude',
  };

  const ignoreExemple: Filter = {
    filter: intl.formatMessage({ id: 'generalTests.tuto.pinSample' }),
    option: 'ignore',
  };
  return [includeExemple, excludeExemple, ignoreExemple];
}

// Tutorial step showing a sample pin, drawn by the real `FilterPins` so that
// it looks exactly like the ones of the search bar. The setter is a no-op:
// the sample pin is only there to be seen.
function PinStep({ option }: { option: Filter['option'] }): ReactElement {
  const intl = useIntl();
  const pins = samplePins(intl);
  const messageId = {
    include: 'generalTests.tuto.filterPinInclude',
    exclude: 'generalTests.tuto.filterPinExclude',
    ignore: 'generalTests.tuto.filterPinIgnore',
  }[option];
  const pin = (
    <FilterPins
      filters={pins.filter((pin) => pin.option == option)}
      setFilters={() => {}}
    />
  );
  return <FormattedMessage id={messageId} values={{ pin }} />;
}

// The welcome steps come first in the tour but are not a chapter of the menu,
// so the chapters start after them.
export function tutoChapters(intl: IntlShape): PlacedChapter[] {
  return placeChapters(
    [
      { title: 'generalTests.tuto.chapter.buttons', steps: stepsButton },
      { title: 'generalTests.tuto.chapter.filters', steps: stepsFilter(intl) },
      { title: 'generalTests.tuto.chapter.tests', steps: stepsTests },
    ],
    stepsWelcome.length
  );
}

export function tutoSteps(intl: IntlShape): Step[] {
  return [
    ...stepsWelcome,
    ...tutoChapters(intl).flatMap((chapter) => chapter.steps),
  ];
}
