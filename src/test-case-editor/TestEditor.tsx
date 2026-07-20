import type { ChangeEvent } from 'react';
import { type ReactElement, useEffect, useRef } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  type Test,
  type TestInputs,
  type TestRunResults,
  type PathSegment,
} from '../generated/catala_types';
import TestInputsEditor from './TestInputsEditor';
import TestOutputsEditor from './TestOutputsEditor';
import ExpectedVariablesEditor from './ExpectedVariablesEditor';
import { type TestRunStatus } from './TestFileEditor';
import {
  type TraceElement,
  type TraceValue,
  scopeVariables,
  traceValueFromRuntime,
  traceValueToRuntime,
} from '../trace-editor/traceUtils';
import { confirm } from '../messaging/confirm';
import { getVsCodeApi } from '../shared/webviewApi';
import {
  hasUnsetInTest,
  scrollToFirstInvalidOrUnset,
} from '../editors/unsetValidation';

type Props = {
  test: Test;
  onTestChange(newValue: Test, mayBeBatched: boolean): void;
  onTestDelete(testScope: string): void;
  onTestRun(testScope: string): void;
  onTestOutputsReset(testScope: string): void;
  runState?: {
    status: TestRunStatus;
    results?: TestRunResults;
    stale?: boolean;
  };
  /**
   * Trace computed by running this test's scope with tracing (`undefined` if
   * not computed yet). Used both to propose expected variables and to open the
   * trace editor.
   */
  trace?: TraceElement[];
  onDiffResolved(scope: string, path: PathSegment[]): void;
  onInvalidateDiffs(scope: string, pathPrefix: PathSegment[]): void;
};

// Editor for a single test case (child of TestFileEditor)
export default function TestEditor(props: Props): ReactElement {
  const intl = useIntl();

  function onTestInputsChange(newValue: TestInputs): void {
    props.onTestChange(
      {
        ...props.test,
        test_inputs: newValue,
      },
      false
    );
  }

  function onDescriptionChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    props.onTestChange(
      {
        ...props.test,
        description: event.target.value,
      },
      true
    );
  }

  function onTitleChange(newTitle: string): void {
    props.onTestChange(
      {
        ...props.test,
        title: newTitle,
      },
      true
    );
  }

  function onVariablesChange(next: Map<string, TraceValue>): void {
    const variables = [...next.entries()].reduce((acc, [name, value]) => {
      const rv = traceValueToRuntime(value);
      if (rv !== undefined) {
        acc.set(name, { value: rv, attrs: [] });
      }
      return acc;
    }, new Map());
    props.onTestChange({ ...props.test, variables }, false);
  }

  const expectedSectionRef = useRef<HTMLDivElement>(null);
  // Scope for searching the first '.value-editor.invalid' or '.value-editor.unset' before running; used to scroll into view
  const unsetElementRef = useRef<HTMLDivElement>(null);
  const expectedAnchorId = `expected-${encodeURIComponent(props.test.testing_scope)}`;

  useEffect(() => {
    const runState = props.runState;
    const shouldFocus =
      !!runState &&
      runState.results?.kind === 'Ok' &&
      runState.results.value.assert_failures;

    if (shouldFocus) {
      setTimeout(() => {
        expectedSectionRef.current?.focus();
        expectedSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 0);
    }
  }, [props.runState]);

  const scrollToFirstUnset = (): void => {
    scrollToFirstInvalidOrUnset(unsetElementRef.current ?? document, 0);
  };

  const runWithUnsetCheck = async (): Promise<void> => {
    if (hasUnsetInTest(props.test)) {
      scrollToFirstUnset();
      const confirmed = await confirm('RunTestWithUnsetValues');
      if (!confirmed) return;
    }
    let date = new Date();
    props.onTestChange(
      {
        ...props.test,
        test_date: `${date.getDate()}/${date.getMonth()}/${date.getFullYear()}`,
      },
      false
    );
    props.onTestRun(props.test.testing_scope);
  };

  const openTraceEditor = (): void => {
    getVsCodeApi().postMessage({
      kind: 'openTraceEditor',
      scope: props.test.testing_scope,
      trace: props.trace,
    });
  };

  const resetWithUnsetCheck = async (): Promise<void> => {
    if (hasUnsetInTest(props.test)) {
      scrollToFirstUnset();
      const confirmed = await confirm('RunTestWithUnsetValues');
      if (!confirmed) return;
    }
    let date = new Date();
    props.onTestChange(
      {
        ...props.test,
        test_date: `${date.getDate()}/${date.getMonth()}/${date.getFullYear()}`,
      },
      false
    );
    props.onTestOutputsReset(props.test.testing_scope);
  };

  const arr = [...props.test.variables.entries()]
    .map(([name, rv]) => {
      const value = traceValueFromRuntime(rv.value);
      return [name, value];
    })
    .filter(([, value]) => value !== undefined) as [string, TraceValue][];
  const variables = new Map(arr);
  
  useEffect(() => {
    if (
      props.runState?.status === 'success' &&
      props.runState?.results?.kind === 'Ok' &&
      !props.runState.results.value.assert_failures
    ) {
      props.onTestChange({ ...props.test, test_success: true }, false);
    }

    if (
      props.runState?.status === 'error' ||
      (props.runState?.results?.kind === 'Ok' &&
        props.runState.results.value.assert_failures)
    ) {
      props.onTestChange({ ...props.test, test_success: false }, false);
    }
  }, [props.runState]);

  return (
    <div className="test-editor" ref={unsetElementRef}>
      <div className="test-editor-breadcrumb body-b3">
        {props.test.testing_scope} ➛ {String(props.test.tested_scope.name)}
      </div>
      <div className="test-title-wrapper">
        <input
          type="text"
          className="test-title-input heading-h2"
          value={props.test.title}
          onChange={(e) => onTitleChange(e.target.value)}
          aria-label={intl.formatMessage({
            id: 'testEditor.title',
            defaultMessage: 'Title',
          })}
          placeholder={intl.formatMessage({
            id: 'testEditor.titlePlaceholder',
            defaultMessage: 'Test title...',
          })}
        />
        <span
          className="codicon codicon-edit test-title-edit-icon"
          aria-hidden="true"
        />
      </div>
      <div className="test-editor-content">
        <div className="test-section">
          <h2 className="test-section-title heading-h2">
            <FormattedMessage
              id="testEditor.description"
              defaultMessage="Description"
            />
          </h2>
          <div className="test-description-editor">
            <textarea
              value={props.test.description}
              onChange={onDescriptionChange}
              onBlur={onDescriptionChange}
              placeholder={intl.formatMessage({
                id: 'testEditor.descriptionPlaceholder',
              })}
              rows={10}
              className="test-description-textarea"
            />
          </div>
        </div>
        <div className="test-section">
          <h2 className="test-section-title heading-h2">
            <FormattedMessage id="testEditor.inputs" />
          </h2>
          <TestInputsEditor
            test_inputs={props.test.test_inputs}
            tested_scope={props.test.tested_scope}
            onTestInputsChange={onTestInputsChange}
          />
        </div>
        <ExpectedVariablesEditor
          variables={variables}
          scopeVariables={props.trace ? scopeVariables(props.trace) : undefined}
          onChange={onVariablesChange}
        />
        <div
          className="test-section"
          id={expectedAnchorId}
          ref={expectedSectionRef}
          tabIndex={-1}
        >
          <h2 className="test-section-title heading-h2">
            <FormattedMessage id="testEditor.expectedValues" />
          </h2>
          <div className="test-result-header">
            <div className="test-result-action-bar">
              <button
                className="reset-expected-values button-action-dvp body-b3"
                title={intl.formatMessage({ id: 'testEditor.resetExpected' })}
                onClick={resetWithUnsetCheck}
              >
                <span className="codicon codicon-refresh"></span>{' '}
                <FormattedMessage id="testEditor.resetExpectedButton" />
              </button>
              <button
                className={`button-action-dvp body-b3 ${props.runState?.status ?? ''}`}
                title={intl.formatMessage({ id: 'testEditor.runTest' })}
                onClick={runWithUnsetCheck}
                disabled={props.runState?.status === 'running'}
              >
                <span
                  className={`codicon ${props.runState?.status === 'running' ? 'codicon-loading codicon-modifier-spin' : 'codicon-play'}`}
                ></span>{' '}
                {intl.formatMessage({ id: 'testEditor.runTest' })}
              </button>
              <button
                className="button-action-dvp body-b3"
                title="Open the trace editor for this test"
                onClick={openTraceEditor}
              >
                <span className="codicon codicon-graph"></span> Trace
              </button>
            </div>
            <div className="test-result">
              {props.runState?.status === 'success' &&
                props.runState?.results?.kind === 'Ok' &&
                !props.runState.results.value.assert_failures && (
                  <p className="test-run-result test-run-success body-1">
                    <span className="codicon codicon-check-all"></span>
                    <FormattedMessage
                      id="testEditor.passed"
                      defaultMessage="Passed"
                    />
                  </p>
                )}
              {(props.runState?.status === 'error' ||
                (props.runState?.results?.kind === 'Ok' &&
                  props.runState.results.value.assert_failures)) && (
                <div className="test-result-information">
                  <p className="test-run-result test-run-error body-1">
                    <span className="codicon codicon-warning"></span>
                    <FormattedMessage
                      id="testEditor.failed"
                      defaultMessage="Failed"
                    />
                  </p>
                </div>
              )}
            </div>
            {props.runState?.stale && (
              <div className="test-result-information">
                <p className="body-3">
                  <span className="codicon codicon-history"></span>{' '}
                  <FormattedMessage
                    id="testEditor.diffsStale"
                    defaultMessage="Diffs are out of date. Re-run to refresh."
                  />
                </p>
              </div>
            )}
          </div>

          <TestOutputsEditor
            test={props.test}
            onTestChange={(test) => {
              props.onTestChange(test, false);
            }}
            diffs={
              props.runState?.results?.kind === 'Ok'
                ? props.runState.results.value.diffs
                : []
            }
            onDiffResolved={(path: PathSegment[]) =>
              props.onDiffResolved(props.test.testing_scope, path)
            }
            onInvalidateDiffs={(pathPrefix: PathSegment[]) =>
              props.onInvalidateDiffs(props.test.testing_scope, pathPrefix)
            }
          />
        </div>
      </div>
    </div>
  );
}
