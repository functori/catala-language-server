import { type ReactElement } from 'react';
import TestFileEditor from './test-case-editor/TestFileEditor';
import ScopeInputEditor from './scope-editor/ScopeInputEditor';
import TraceEditor from './trace-editor/TraceEditor';

import { type WebviewApi } from 'vscode-webview';

import GeneralTests from './GeneralTests';
import { CatalaSettingsProvider } from './shared/useSettings';

type Props = {
  language: string;
  vscode: WebviewApi<unknown>;
  scopename?: string;
};

export default function App({ language, vscode }: Props): ReactElement {
  return (
    <CatalaSettingsProvider language={language}>
      <TestFileEditor contents={{ state: 'initializing' }} vscode={vscode} />
    </CatalaSettingsProvider>
  );
}

export function InputApp({ language, vscode, scopename }: Props): ReactElement {
  return (
    <CatalaSettingsProvider language={language}>
      <ScopeInputEditor
        contents={{ state: 'initializing' }}
        vscode={vscode}
        scopename={scopename ?? ''}
      />
    </CatalaSettingsProvider>
  );
}

export function GeneralTestsUi({ language, vscode }: Props): ReactElement {
  return (
    <CatalaSettingsProvider language={language}>
      <GeneralTests vscode={vscode} />
    </CatalaSettingsProvider>
  );
}

export function TraceApp({ language, vscode }: Props): ReactElement {
  return (
    <CatalaSettingsProvider language={language}>
      <TraceEditor vscode={vscode} />
    </CatalaSettingsProvider>
  );
}
