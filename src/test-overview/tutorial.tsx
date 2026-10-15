import { type ReactElement } from 'react';
import { FormattedMessage, type IntlShape, useIntl } from 'react-intl';
import type { Step } from 'react-joyride';

import { FilterPins, type Filter } from '../FilterPin';
import { placeChapters, type PlacedChapter } from '../shared/Tutorial';
import type { TestMacro, TestState } from './types';
import { TestStateIcon } from './widgets';

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

// Like the welcome step, the closing one is not a chapter of the menu.
const stepsEnd: Step[] = [
  {
    id: 'end',
    content: <FormattedMessage id="generalTests.tuto.end" />,
    target: 'body',
    placement: 'center',
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

const stepsCard: Step[] = [
  {
    id: 'tests_display_card',
    content: <FormattedMessage id="generalTests.tuto.displayCard" />,
    target: '#displayCard',
    placement: 'top',
  },
  // The fields of a card, shown on the sample test.
  {
    id: 'tests_card_title',
    content: <FormattedMessage id="generalTests.tuto.card.title" />,
    target: '.test-item .test-title',
    placement: 'top',
  },
  {
    id: 'tests_card_number',
    content: <FormattedMessage id="generalTests.tuto.card.number" />,
    target: '.test-item .test-number',
    placement: 'top',
  },
  {
    id: 'tests_card_description',
    content: <FormattedMessage id="generalTests.tuto.card.description" />,
    target: '.test-item .test-descr',
    placement: 'top',
  },
  {
    id: 'tests_card_state',
    content: <SampleStates />,
    target: '.test-item .check-icon',
    placement: 'top',
  },
  {
    id: 'tests_card_date',
    content: <FormattedMessage id="generalTests.tuto.card.date" />,
    target: '.test-item .test-date',
    placement: 'top',
  },
  {
    id: 'tests_card_open',
    content: <FormattedMessage id="generalTests.tuto.card.open" />,
    target: '.test-item .open-gui',
    placement: 'top',
  },
  {
    id: 'tests_card_run',
    content: <FormattedMessage id="generalTests.tuto.card.run" />,
    target: '.test-item .run-icon',
    placement: 'top',
  },
];

const stepsList: Step[] = [
  {
    id: 'tests_display_list',
    content: <FormattedMessage id="generalTests.tuto.displayList" />,
    target: '#displayList',
    placement: 'top',
  },
  // The columns of the list, shown on the sample test. The texts shared with
  // the card are reused.
  {
    id: 'tests_list_file',
    content: <FormattedMessage id="generalTests.tuto.list.file" />,
    target: '.test-list tbody tr .path-column',
    placement: 'top',
  },
  {
    id: 'tests_list_title',
    content: <FormattedMessage id="generalTests.tuto.card.title" />,
    target: '.test-list tbody tr td:nth-child(2)',
    placement: 'top',
  },
  {
    id: 'tests_list_scope',
    content: <FormattedMessage id="generalTests.tuto.list.scope" />,
    target: '.test-list tbody tr td:nth-child(3)',
    placement: 'top',
  },
  {
    id: 'tests_list_description',
    content: <FormattedMessage id="generalTests.tuto.card.description" />,
    target: '.test-list tbody tr td:nth-child(4)',
    placement: 'top',
  },
  {
    id: 'tests_list_date',
    content: <FormattedMessage id="generalTests.tuto.card.date" />,
    target: '.test-list tbody tr td:nth-child(5)',
    placement: 'top',
  },
  {
    id: 'tests_list_state',
    content: <SampleStates />,
    target: '.test-list tbody tr td:nth-child(6)',
    placement: 'top',
  },
  {
    id: 'tests_list_run',
    content: <FormattedMessage id="generalTests.tuto.card.run" />,
    target: '.test-list tbody tr .run-icon',
    placement: 'top',
  },
  {
    id: 'tests_list_open',
    content: <FormattedMessage id="generalTests.tuto.card.open" />,
    target: '.test-list tbody tr .open-gui',
    placement: 'top',
  },
];

// One line per state, each with its own icon: written as a sentence, the
// states read as a single one.
function SampleStates(): ReactElement {
  // The ids are written out in full so that the i18n check finds them.
  // `TestStateIcon` derives the state from these two fields.
  const states: [
    TestState,
    { loading?: boolean; success?: boolean },
    string,
  ][] = [
    ['Success', { success: true }, 'generalTests.tuto.card.stateSuccess'],
    ['Failed', { success: false }, 'generalTests.tuto.card.stateFailed'],
    ['Loading', { loading: true }, 'generalTests.tuto.card.stateLoading'],
    ['Unknown', {}, 'generalTests.tuto.card.stateUnknown'],
  ];
  return (
    <div style={{ textAlign: 'left' }}>
      <FormattedMessage id="generalTests.tuto.card.state" />
      <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
        {states.map(([state, props, id]) => (
          <li
            key={state}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}
          >
            <TestStateIcon {...props} />
            <FormattedMessage id={id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function sampleTest(intl: IntlShape): TestMacro {
  return {
    index: 0,
    filename: 'tests/test_1.catala_en',
    relative_filename: 'tests/test_1.catala_en',
    test: {
      kind: 'GUI',
      value: {
        scope: 'Test1',
        scope_tested: intl.formatMessage({
          id: 'generalTests.tuto.sampleScope',
        }),
        title: intl.formatMessage(
          { id: 'generalTests.tuto.sampleTitle' },
          { num: 1 }
        ),
        description: intl.formatMessage({
          id: 'generalTests.tuto.sampleDescription',
        }),
      },
    },
    success: true,
    // ISO 8601, as the host records it: `TestDate` formats it with
    // `intl.formatDate`.
    date: '2026-10-13T10:00:00',
  };
}

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
      { title: 'generalTests.tuto.chapter.card', steps: stepsCard },
      { title: 'generalTests.tuto.chapter.list', steps: stepsList },
    ],
    stepsWelcome.length
  );
}

export function tutoSteps(intl: IntlShape): Step[] {
  return [
    ...stepsWelcome,
    ...tutoChapters(intl).flatMap((chapter) => chapter.steps),
    ...stepsEnd,
  ];
}
