import { useEffect, useState, type ReactElement } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import { type WebviewApi } from 'vscode-webview';

import type { TestDebugger, TestState } from './generated/catala_types';
import { readDownMessage, writeUpMessage } from './generated/catala_types';
import { Box, Checkbox, FormControlLabel, Grid } from '@mui/material';
import { VscodeTextfield } from '@vscode-elements/react-elements';
import { assertUnreachable } from './shared/util';
import { setVsCodeApi } from './shared/webviewApi';

type TestGridArg = {
  vscode: WebviewApi<unknown>;
  tests: TestDebugger[];
  grid: boolean;
  filter: string;
  filterScope: string[];
  filterGui: boolean;
  onRun: (id: number) => void;
};

type GeneralTestsArg = {
  vscode: WebviewApi<unknown>;
};

type TestItemArg = {
  vscode: WebviewApi<unknown>;
  test: TestDebugger;
  num: number;
  onRun: (id: number) => void;
};

type FilterArg = {
  tests: TestDebugger[] | undefined;
  filter: string;
  filterScope: string[];
  setFilterScope: React.Dispatch<React.SetStateAction<string[]>>;
  setFilter: React.Dispatch<React.SetStateAction<string>>;
  filterGui: boolean;
  setFilterGui: React.Dispatch<React.SetStateAction<boolean>>;
};

type ScopeFilterArg = {
  tests: TestDebugger[] | undefined;
  filterScope: string[];
  setFilterScope: React.Dispatch<React.SetStateAction<string[]>>;
};

function RunAllTests({
  onRun,
}: {
  className?: string | undefined;
  onRun: () => void;
}): ReactElement {
  return (
    <span
      onClick={(event) => {
        event.preventDefault();
        onRun();
      }}
      className="vscode-button"
    >
      <FormattedMessage
        id="generalTests.runAllTests"
        defaultMessage="Lancer les tests"
      />
    </span>
  );
}

function AddNewTest({ vscode }: { vscode: WebviewApi<unknown> }): ReactElement {
  return (
    <span
      className="vscode-button"
      onClick={(event) => {
        event.preventDefault();
        vscode.postMessage(
          writeUpMessage({
            kind: 'OpenTestScopePicker',
          })
        );
      }}
    >
      <FormattedMessage
        id="generalTests.addTest"
        defaultMessage="Ajouter un test"
      />
    </span>
  );
}

function SeparationLine(): ReactElement {
  return <div className="separation-line" />;
}

function testState(success: TestState): ReactElement {
  switch (success.kind) {
    case 'Success':
      return (
        <span
          className="codicon codicon-check-all check-icon"
          style={{ color: 'darkgreen', fontSize: '1.5em' }}
        />
      );
    case 'Failed':
      return (
        <span
          className="codicon codicon-error wrong-icon"
          style={{ color: 'darkred', fontSize: '1.5em' }}
        />
      );
    case 'JustFailed':
      return (
        <span
          className="codicon codicon-error wrong-icon"
          style={{ color: 'darkred', fontSize: '1.5em' }}
        />
      );
    case 'Loading':
      return (
        <span
          className="codicon codicon-loading codicon-modifier-spin"
          style={{ fontSize: '1.5em' }}
        />
      );
    case 'Unknown':
      return <span className="codicon codicon-question" />;
    default:
      return assertUnreachable(success);
  }
}

function RunIcon({
  className,
  onRun,
}: {
  className?: string | undefined;
  onRun: () => void;
}): ReactElement {
  return (
    <span
      onClick={(event) => {
        event.preventDefault();
        onRun();
      }}
      className={`codicon codicon-debug-start ${className}`}
    />
  );
}

function OpenGUI({
  vscode,
  filename,
  success,
}: {
  vscode: WebviewApi<unknown>;
  filename: string;
  success: TestState;
}): ReactElement {
  let fail = success.kind == 'JustFailed';
  let [first, setFirst] = useState<boolean>(true);
  return (
    <span
      onAnimationEnd={(event) => {
        event.preventDefault();
        setFirst(false);
      }}
      onClick={(event) => {
        event.preventDefault();
        vscode.postMessage(
          writeUpMessage({ kind: 'OpenInTestEditor', value: filename })
        );
      }}
      className={`codicon codicon-eye open-gui ${fail && first ? 'highlight ' : ''}`}
    />
  );
}

function OpenTextEditor({
  vscode,
  filename,
}: {
  vscode: WebviewApi<unknown>;
  filename: string;
}): ReactElement {
  return (
    <span
      onClick={(event) => {
        event.preventDefault();
        vscode.postMessage(
          writeUpMessage({
            kind: 'OpenInTextEditor',
            value: { value: filename },
          })
        );
      }}
      className="codicon codicon-go-to-file open-text"
    />
  );
}

function TestItem({ vscode, test, num, onRun }: TestItemArg): ReactElement {
  return (
    <Box className="test-item">
      <div className="test-item-header">
        <b className="test-title">{testTitle(test)}</b>
        <span className="test-number">
          <FormattedMessage
            id="generalTests.testNumber"
            defaultMessage="Test #{num}"
            values={{ num: num + 1 }}
          />
        </span>
      </div>
      <span className="test-descr">{testDescription(test)}</span>
      <SeparationLine />
      <div className="footer">
        {testState(test.success)}
        <span>
          <FormattedMessage
            id="generalTests.testedOn"
            defaultMessage="Testé le {date}"
            values={{
              date: testDate(test) != undefined ? testDate(test) : `??/??/????`,
            }}
          />
        </span>
        {isGui(test) ? (
          <OpenGUI
            vscode={vscode}
            filename={test.filename}
            success={test.success}
          />
        ) : (
          <OpenTextEditor vscode={vscode} filename={test.filename} />
        )}
        <RunIcon className="run-icon" onRun={() => onRun(num)} />
      </div>
    </Box>
  );
}

function TestLine({ vscode, test, num, onRun }: TestItemArg): ReactElement {
  return (
    <tr>
      <th>{num + 1}</th>
      <td>10/10/2024</td>
      <td>{testingScope(test)}</td>
      <td>{testDescription(test)}</td>
      <td>{testDate(test) ? testDate(test) : `??/??/????`}</td>
      <td>{testState(test.success)}</td>
      <td>
        <span
          className="codicon codicon-debug-start run-icon"
          onClick={(event) => {
            event.preventDefault();
            onRun(num);
          }}
        />
      </td>
      <td>
        {isGui(test) ? (
          <OpenGUI
            vscode={vscode}
            filename={test.filename}
            success={test.success}
          />
        ) : (
          <OpenTextEditor vscode={vscode} filename={test.filename} />
        )}
      </td>
    </tr>
  );
}

function HeaderLine(): ReactElement {
  return (
    <thead>
      <tr>
        <th>
          <FormattedMessage id="generalTests.header.id" defaultMessage="Id" />
        </th>
        <td>
          <FormattedMessage
            id="generalTests.header.lastModified"
            defaultMessage="Date dernière modification"
          />
        </td>
        <td>
          <FormattedMessage
            id="generalTests.header.scope"
            defaultMessage="Champ d'application"
          />
        </td>
        <td>
          <FormattedMessage
            id="generalTests.header.description"
            defaultMessage="Description"
          />
        </td>
        <td>
          <FormattedMessage
            id="generalTests.header.lastTestDate"
            defaultMessage="Date du dernier test"
          />
        </td>
        <td>
          <FormattedMessage
            id="generalTests.header.testResult"
            defaultMessage="Résultat du test"
          />
        </td>
        <td>
          <RunIcon onRun={() => {}} />
        </td>
        <td>
          <FormattedMessage id="generalTests.header.gui" defaultMessage="GUI" />
        </td>
      </tr>
    </thead>
  );
}

// The `gui` flag is now carried by the `test` union's constructor: a GUI
// entry wraps a full `Test`, a plain entry wraps a `TestSum`. These helpers
// read the fields that both variants share, plus the run metadata that lives
// on the `TestDebugger` wrapper.
function isGui(test: TestDebugger): boolean {
  return test.test.kind === 'GUI';
}

function testTitle(test: TestDebugger): string {
  return test.test.value.title;
}

function testDescription(test: TestDebugger): string {
  return test.test.value.description;
}

function testingScope(test: TestDebugger): string {
  return test.test.value.testing_scope;
}

function testDate(test: TestDebugger): string | undefined {
  return test.test.value.test_date;
}

// A GUI test's scope comes from its `tested_scope`; a regular test uses `testing_scope`.
function testScope(test: TestDebugger): string {
  return test.test.kind === 'GUI'
    ? test.test.value.tested_scope.name
    : test.test.value.testing_scope;
}

function matchFilter(
  test: TestDebugger,
  index: number,
  filterBar: string,
  filterScope: string[],
  filterGui: boolean
): boolean {
  let filter = filterBar.toLowerCase();
  let searchBarFilter =
    testTitle(test).toLowerCase().includes(filter) ||
    testDescription(test).toLowerCase().includes(filter) ||
    testingScope(test).toLowerCase().includes(filter) ||
    (index + 1).toString().includes(filter);
  let scopeFilter =
    filterScope.length == 0
      ? true
      : filterScope.some((value) => testScope(test) == value);
  let guiFilter = filterGui ? isGui(test) : true;
  return searchBarFilter && scopeFilter && guiFilter;
}

type OriginalTest = { index: number; test: TestDebugger };

type CardGridArg = {
  vscode: WebviewApi<unknown>;
  filteredScope: string[];
  tests: OriginalTest[];
  onRun: (id: number) => void;
};

function CardGrid({
  vscode,
  tests,
  filteredScope,
  onRun,
}: CardGridArg): ReactElement {
  let gridTests = new Map<string, OriginalTest[]>();
  if (filteredScope.length != 0) {
    for (let index = 0; index < tests.length; index++) {
      const elt = tests[index];
      let scopeFiltered = testScope(elt.test);
      let scopeTested = gridTests.get(scopeFiltered) ?? [];
      scopeTested.push(elt);
      gridTests.set(scopeFiltered, scopeTested);
    }
    return (
      <Grid container spacing={4}>
        {Array.from(gridTests.entries()).map(([scope, tests]) => (
          <>
            <Grid size={3}>
              <h2 style={{ overflowX: 'auto' }}>{scope}</h2>
              <h3>
                <FormattedMessage
                  id="generalTests.associatedTests"
                  defaultMessage="{count} tests associés"
                  values={{ count: tests.length }}
                />
              </h3>
            </Grid>
            <Grid container size={9} spacing={2} columns={3}>
              {tests.map((elt, index) => (
                <Grid key={index} size={1}>
                  <div style={{ fontSize: '8px', height: '100%' }}>
                    <TestItem
                      vscode={vscode}
                      test={elt.test}
                      num={elt.index}
                      onRun={onRun}
                    />
                  </div>
                </Grid>
              ))}
            </Grid>
          </>
        ))}
      </Grid>
    );
  } else {
    return (
      <Grid container spacing={4} columns={{ xs: 1, sm: 3, md: 4 }}>
        {tests.map((elt, index) => (
          <Grid key={index} size={1}>
            <div style={{ fontSize: '8px', height: '100%' }}>
              <TestItem
                vscode={vscode}
                test={elt.test}
                num={elt.index}
                onRun={onRun}
              />
            </div>
          </Grid>
        ))}
      </Grid>
    );
  }
}

function TestsGrid({
  vscode,
  tests,
  grid,
  filter,
  filterScope,
  filterGui,
  onRun,
}: TestGridArg): ReactElement {
  const filtered = Array.from(tests)
    .map((test, index) => ({ test, index }))
    .filter(({ test, index }) =>
      matchFilter(test, index, filter, filterScope, filterGui)
    );

  if (filtered.length === 0) {
    return (
      <div className="no-tests">
        <span>
          <FormattedMessage
            id="generalTests.noTestsFound"
            defaultMessage="Aucun test trouvé"
          />
        </span>{' '}
        <AddNewTest vscode={vscode} />
      </div>
    );
  }

  return grid ? (
    <CardGrid
      filteredScope={filterScope}
      vscode={vscode}
      tests={filtered}
      onRun={onRun}
    />
  ) : (
    <table className="test-list">
      <HeaderLine />
      <tbody>
        {filtered.map(({ test, index }) => (
          <TestLine
            key={index}
            vscode={vscode}
            test={test}
            num={index}
            onRun={onRun}
          />
        ))}
      </tbody>
    </table>
  );
}

function scopesFromTests(tests: TestDebugger[]): string[] {
  let allScopes = tests?.map((test, _) => testScope(test)).sort();
  let scopes = [];
  let prev = '';
  for (let index = 0; index < allScopes!.length; index++) {
    const element = allScopes![index];
    if (prev != element) {
      scopes.push(element);
      prev = element;
    }
  }
  return scopes;
}

function ScopeFilter({
  tests,
  filterScope,
  setFilterScope,
}: ScopeFilterArg): ReactElement {
  let filteredScope = scopesFromTests(tests ?? []);
  return (
    <div className="scope-filter">
      <Box
        sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, textAlign: 'center' }}
      >
        {filteredScope.length == 0 ? (
          <span className="no-scope">
            <FormattedMessage
              id="generalTests.noScopeFound"
              defaultMessage="Aucun Champ d'application trouvé"
            />
          </span>
        ) : (
          Array.from(filteredScope).map((scope, index) => (
            <span
              key={index}
              onClick={(event) => {
                event.preventDefault();
                setFilterScope((previous) => {
                  let length = previous.length;
                  let newScopes = previous.filter((value) => value != scope);
                  if (newScopes.length == length) {
                    newScopes.push(scope);
                  }
                  return newScopes;
                });
              }}
              className={`scope-title ${filterScope.includes(scope) ? 'selected-filter' : ''}`}
            >
              {scope}
            </span>
          ))
        )}
      </Box>
    </div>
  );
}

function Filter({
  tests,
  filter,
  filterScope,
  setFilterScope,
  setFilter,
  filterGui,
  setFilterGui,
}: FilterArg): ReactElement {
  const intl = useIntl();
  // Restore the default state: GUI-only checkbox checked, no scope selected,
  // empty search bar.
  const resetFilters = (): void => {
    setFilterGui(true);
    setFilterScope([]);
    setFilter('');
  };
  return (
    <div className="box-filter">
      <div className="filter-title">
        <h2>
          <FormattedMessage
            id="generalTests.filters"
            defaultMessage="Filtres"
          />
        </h2>
        <span
          className="vscode-button reset-filters"
          onClick={(event) => {
            event.preventDefault();
            resetFilters();
          }}
        >
          <span className="codicon codicon-clear-all" />
          <FormattedMessage
            id="generalTests.resetFilters"
            defaultMessage="Réinitialiser les filtres"
          />
        </span>
      </div>
      {tests === undefined ? (
        <Loading size="small" />
      ) : (
        <>
          <FormControlLabel
            control={
              <Checkbox
                checked={filterGui}
                onChange={(event) => setFilterGui(event.target.checked)}
                sx={{ color: 'gray', '&.Mui-checked': { color: 'lightgray' } }}
              />
            }
            label={
              <FormattedMessage
                id="generalTests.guiOnly"
                defaultMessage="Tests GUI uniquement"
              />
            }
            sx={{ '.MuiFormControlLabel-label': { color: 'gray' } }}
          />
          <ScopeFilter
            tests={tests}
            filterScope={filterScope}
            setFilterScope={setFilterScope}
          />
          <VscodeTextfield
            className="search-bar"
            value={filter}
            placeholder={intl.formatMessage({
              id: 'generalTests.searchPlaceholder',
              defaultMessage: 'Rechercher un test…',
            })}
            onInput={(e) => {
              const value = (e.target as HTMLInputElement).value;
              setFilter(value);
            }}
          >
            <span className="codicon codicon-search" slot="content-before" />
          </VscodeTextfield>
        </>
      )}
    </div>
  );
}

function Loading({
  size,
}: {
  size: 'small' | 'medium' | 'large' | undefined;
}): ReactElement {
  const fontSize = size === 'small' ? '2em' : size === 'large' ? '6em' : '4em';
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        className="codicon codicon-loading codicon-modifier-spin"
        style={{ fontSize }}
      />
    </div>
  );
}

// Total duration of the `highlight` blink animation (`blink 1s ... 4` = 1s ×
// 4 iterations), plus a small margin so the timer settles just after the
// animation has visually finished.
const HIGHLIGHT_MS = 4100;

export default function GeneralTests({
  vscode,
}: GeneralTestsArg): ReactElement {
  const [filter, setFilter] = useState<string>('');
  const [filterScope, setFilterScope] = useState<string[]>([]);
  const [filterGui, setFilterGui] = useState<boolean>(true);
  const [grid, setGrid] = useState<boolean>(true);
  const [tests, setTests] = useState<TestDebugger[] | undefined>(undefined);
  const [reload, setReload] = useState<boolean>(false);

  useEffect(() => {
    setVsCodeApi(vscode);
  }, [vscode]);

  // Downgrade a 'JustFailed' test to the stable 'Failed' state once its
  // one-shot highlight animation is done. The `kind === 'JustFailed'` guard
  // makes this idempotent and safe against stale timers: if the test has
  // meanwhile been re-run (Loading) or now passes, the timer is a no-op.
  const settleHighlight = (id: number): void => {
    setTests((oldTests) =>
      oldTests?.map((test, index) =>
        index === id && test.success.kind === 'JustFailed'
          ? { ...test, success: { kind: 'Failed' } }
          : test
      )
    );
  };

  const scheduleSettle = (id: number): void => {
    setTimeout(() => settleHighlight(id), HIGHLIGHT_MS);
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      const message = readDownMessage(event.data);
      switch (message.kind) {
        case 'AllTests':
          setReload(false);
          setTests(message.value);
          break;
        case 'TestRunResults': {
          break;
        }
        case 'Update': {
          /* TODO */
          break;
        }
        case 'TestScopeResult': {
          let [result, id] = message.value;
          setTests((oldTests) =>
            oldTests?.map((test, index) => {
              if (index != id) {
                return test;
              }
              switch (result.kind) {
                case 'ScopeTest':
                  return {
                    ...test,
                    success: result.value.success
                      ? { kind: 'Success' }
                      : { kind: 'Failed' },
                  };
                case 'GuiTest': {
                  let [newTest, success] = result.value;
                  let successObj: TestState = success
                    ? { kind: 'Success' }
                    : { kind: 'JustFailed' };
                  return {
                    ...test,
                    test: { kind: 'GUI', value: newTest },
                    success: successObj,
                  };
                }
                case 'Error':
                  return { ...test, success: { kind: 'JustFailed' } };
                case 'Cancelled':
                  return { ...test, success: { kind: 'Unknown' } };
              }
            })
          );
          if (result.kind === 'Error') {
            scheduleSettle(id);
          }
          break;
        }
        case 'ConfirmResult': {
          throw Error('Unexpected message');
        }
        default:
          assertUnreachable(message);
      }
    };

    window.addEventListener('message', handleMessage);

    // Cleanup function to remove event listener
    return (): void => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const onRun = (id: number): void => {
    if (!tests) {
      return;
    }
    const entry = tests[id];
    if (entry?.test.kind === 'GUI') {
      // Running a GUI test stamps it with the current date. Reflect the
      // new date locally, and ask the controller to update its own list
      // (which also persists the edited GUI test to its file).
      setTests((oldTests) =>
        oldTests?.map((test, index) =>
          index === id ? { ...test, success: { kind: 'Loading' } } : test
        )
      );
    } else {
      setTests((oldTests) =>
        oldTests?.map((test, index) =>
          index === id ? { ...test, success: { kind: 'Loading' } } : test
        )
      );
    }
    vscode.postMessage(
      writeUpMessage({ kind: 'SpecificTestRequest', value: id })
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', flexDirection: 'row' }}
      >
        <FormattedMessage
          id="generalTests.title"
          defaultMessage="Ensemble des tests"
          children={(msg) => <h1>{msg}</h1>}
        />
        <div className="tests-button">
          <AddNewTest vscode={vscode} />
          <RunAllTests
            onRun={() => {
              if (tests) {
                for (let index = 0; index < tests.length; index++) {
                  let test = tests[index];
                  if (
                    matchFilter(test, index, filter, filterScope, filterGui)
                  ) {
                    onRun(index);
                  }
                }
              }
            }}
          />{' '}
        </div>
      </div>
      <Filter
        tests={tests?.filter((test, index) =>
          matchFilter(test, index, filter, [], filterGui)
        )}
        filter={filter}
        setFilter={setFilter}
        setFilterScope={setFilterScope}
        filterScope={filterScope}
        filterGui={filterGui}
        setFilterGui={setFilterGui}
      />
      <div className="select-test-print">
        <FormattedMessage
          id="generalTests.display"
          defaultMessage="Affichage :"
          children={(msg) => <h3>{msg}</h3>}
        />
        <div
          className={`pp-button ${grid ? 'selected' : ''}`}
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
          className={`pp-button ${grid ? '' : 'selected'}`}
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
        <div className="refresh-box">
          <span
            className={`refresh codicon ${reload ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`}
            onClick={(event) => {
              event.preventDefault();
              setReload(true);
              vscode.postMessage(writeUpMessage({ kind: 'Ready' }));
            }}
          />
        </div>
      </div>
      {tests === undefined ? (
        <Loading size="medium" />
      ) : (
        <TestsGrid
          vscode={vscode}
          tests={tests}
          grid={grid}
          filter={filter}
          filterScope={filterScope}
          filterGui={filterGui}
          onRun={onRun}
        />
      )}
    </div>
  );
}
