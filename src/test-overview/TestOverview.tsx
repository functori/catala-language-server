import { useEffect, useState, type ReactElement } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import { type WebviewApi } from 'vscode-webview';

import { AddNewTest, HelpMenu, RunAllTests } from './buttons';
import type { Filter } from '../FilterPin';
import { matchFilter, noFilter } from './testUtils';
import { TestsGrid } from './TestsView';
import { useTests } from './useTests';
import { Loading } from './widgets';
import { FilterPanel } from './Filter';
import { TutoMenu, tutoLocale, tutoOptions } from '../shared/Tutorial';
import { useJoyride } from 'react-joyride';
import { samplePins, sampleTest, tutoChapters, tutoSteps } from './tutorial';

type TestOverviewArg = {
  vscode: WebviewApi<unknown>;
};

export default function TestOverview({
  vscode,
}: TestOverviewArg): ReactElement {
  const [tuto, setTuto] = useState<boolean>(false);
  const intl = useIntl();
  const [filters, setFilters] = useState<Filter[]>([]);
  const [filterScope, setFilterScope] = useState<string[]>([]);
  const [filterGui, setFilterGui] = useState<boolean>(true);
  const [grid, setGrid] = useState<boolean>(true);
  const { tests, reload, onRun, runTests, refresh } = useTests(vscode);

  const filteredTests = tests?.filter((test) =>
    matchFilter(test, filters, filterScope, filterGui)
  );

  const { controls, on, state, Tour } = useJoyride({
    continuous: true,
    steps: tutoSteps(intl),
    options: tutoOptions,
    locale: tutoLocale(intl),
  });

  useEffect(() => {
    on('tour:end', () => {
      setTuto(false);
    });
    on('error', () => {
      setTuto(false);
    });
    on('tour:start', () => {
      setTuto(true);
    });
  }, [on]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Tour}
      {state.status === 'running' && (
        <TutoMenu
          state={state}
          controls={controls}
          chapters={tutoChapters(intl)}
        />
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexDirection: 'row',
        }}
      >
        <FormattedMessage
          id="generalTests.title"
          defaultMessage="Ensemble des tests"
          children={(msg) => <h1>{msg}</h1>}
        />
        <div className="tests-button">
          <AddNewTest id="addTest" vscode={vscode} />
          <RunAllTests
            id="runAllTests"
            onRun={() =>
              runTests(
                noFilter(filters, filterScope, filterGui)
                  ? 'all'
                  : filteredTests
              )
            }
          />{' '}
        </div>
      </div>
      <FilterPanel
        tests={tests}
        setFilterScope={setFilterScope}
        filterScope={filterScope}
        filterGui={filterGui}
        setFilterGui={setFilterGui}
        filters={tuto ? samplePins(intl) : filters}
        setFilters={setFilters}
      />
      <div className="select-test-print">
        <FormattedMessage
          id="generalTests.display"
          defaultMessage="Affichage :"
          children={(msg) => <h3>{msg}</h3>}
        />
        <div
          id="displayMode"
          style={{ display: 'flex', alignItems: 'center', gap: '2em' }}
        >
          <div
            id="displayCard"
            className={`pp-button ${grid ? 'selected' : ''}`}
            title={intl.formatMessage({
              id: 'generalTests.tooltip.displayCard',
              defaultMessage: 'Afficher les tests sous forme de cartes',
            })}
            onClick={(event) => {
              event.preventDefault();
              setGrid((_) => true);
            }}
          >
            <span className="codicon codicon-layout" />
            <span>
              <FormattedMessage id="generalTests.card" defaultMessage="Carte" />
            </span>
          </div>
          <div
            id="displayList"
            className={`pp-button ${grid ? '' : 'selected'}`}
            title={intl.formatMessage({
              id: 'generalTests.tooltip.displayList',
              defaultMessage: 'Afficher les tests sous forme de liste',
            })}
            onClick={(event) => {
              event.preventDefault();
              setGrid((_) => false);
            }}
          >
            <span className="codicon codicon-list-unordered" />
            <span>
              <FormattedMessage id="generalTests.list" defaultMessage="Liste" />
            </span>
          </div>
        </div>
        <div
          className="refresh-box"
          title={intl.formatMessage(
            reload
              ? {
                  id: 'generalTests.tooltip.reloading',
                  defaultMessage: 'Rechargement en cours…',
                }
              : {
                  id: 'generalTests.tooltip.reload',
                  defaultMessage: 'Recharger la liste des tests',
                }
          )}
        >
          <span
            className={`refresh codicon ${reload ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`}
            onClick={(event) => {
              event.preventDefault();
              refresh();
            }}
          />
        </div>
      </div>
      {filteredTests === undefined ? (
        <Loading size="medium" />
      ) : (
        <TestsGrid
          vscode={vscode}
          filtered={tuto ? [sampleTest(intl)] : filteredTests}
          grid={grid}
          filterScope={filterScope}
          onRun={onRun}
          filters={filters}
        />
      )}
      <HelpMenu controls={controls} />
    </div>
  );
}
