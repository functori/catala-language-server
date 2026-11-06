import { type ReactElement } from 'react';
import TestFileEditor from './test-case-editor/TestFileEditor';
import ScopeInputEditor from './scope-editor/ScopeInputEditor';
import TraceEditor from './trace-editor/TraceEditor';

import { type WebviewApi } from 'vscode-webview';
import { type WebviewSettings } from './generated/catala_types';

import { CatalaSettingsProvider } from './shared/useSettings';
import TestOverview from './test-overview/TestOverview';

type Props = {
  settings: WebviewSettings;
  envLanguage: string;
  fileLanguage?: string;
  vscode: WebviewApi<unknown>;
  scopename?: string;
};

export default function App({
  settings,
  envLanguage,
  fileLanguage,
  vscode,
}: Props): ReactElement {
  return (
    <CatalaSettingsProvider
      initialSettings={settings}
      envLanguage={envLanguage}
      fileLanguage={fileLanguage}
    >
      <TestFileEditor contents={{ state: 'initializing' }} vscode={vscode} />
    </CatalaSettingsProvider>
  );
}

export function InputApp({
  settings,
  envLanguage,
  fileLanguage,
  vscode,
  scopename,
}: Props): ReactElement {
  return (
    <CatalaSettingsProvider
      initialSettings={settings}
      envLanguage={envLanguage}
      fileLanguage={fileLanguage}
    >
      <ScopeInputEditor
        contents={{ state: 'initializing' }}
        vscode={vscode}
        scopename={scopename ?? ''}
      />
    </CatalaSettingsProvider>
  );
}

export function GeneralTestsUi({
  settings,
  envLanguage,
  fileLanguage,
  vscode,
}: Props): ReactElement {
  return (
    <CatalaSettingsProvider
      initialSettings={settings}
      envLanguage={envLanguage}
      fileLanguage={fileLanguage}
    >
      <TestOverview vscode={vscode} />
    </CatalaSettingsProvider>
  );
}

export function TraceApp({
  settings,
  envLanguage,
  fileLanguage,
  vscode,
}: Props): ReactElement {
  return (
    <CatalaSettingsProvider
      initialSettings={settings}
      envLanguage={envLanguage}
      fileLanguage={fileLanguage}
    >
      <TraceEditor vscode={vscode} />
    </CatalaSettingsProvider>
  );
}
