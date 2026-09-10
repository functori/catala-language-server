import { type ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import TestFileEditor from './test-case-editor/TestFileEditor';
import ScopeInputEditor from './scope-editor/ScopeInputEditor';
import TraceEditor from './trace-editor/TraceEditor';

import { type WebviewApi } from 'vscode-webview';

import frMessages from './locales/fr.json';
import enMessages from './locales/en.json';
import plMessages from './locales/pl.json';
import GeneralTests from './GeneralTests';
import { CatalaSettingsProvider } from './shared/useSettings';

type Messages = Record<string, string>;

const allMessages: Record<string, Messages> = {
  fr: frMessages,
  en: enMessages,
  pl: plMessages,
};

type Props = {
  language: string;
  vscode: WebviewApi<unknown>;
  scopename?: string;
};

export default function App({ language, vscode }: Props): ReactElement {
  const messages = allMessages[language] || enMessages;

  return (
    <IntlProvider locale={language} messages={messages} defaultLocale="en">
      <CatalaSettingsProvider>
        <TestFileEditor contents={{ state: 'initializing' }} vscode={vscode} />
      </CatalaSettingsProvider>
    </IntlProvider>
  );
}

export function InputApp({ language, vscode, scopename }: Props): ReactElement {
  const messages = allMessages[language] || enMessages;

  return (
    <IntlProvider locale={language} messages={messages} defaultLocale="en">
      <CatalaSettingsProvider>
        <ScopeInputEditor
          contents={{ state: 'initializing' }}
          vscode={vscode}
          scopename={scopename ?? ''}
        />
      </CatalaSettingsProvider>
    </IntlProvider>
  );
}

export function GeneralTestsUi({ language, vscode }: Props): ReactElement {
  const messages = allMessages[language] || enMessages;

  return (
    <IntlProvider locale={language} messages={messages} defaultLocale="en">
      <CatalaSettingsProvider>
        <GeneralTests vscode={vscode} />
      </CatalaSettingsProvider>
    </IntlProvider>
  );
}

export function TraceApp({ language, vscode }: Props): ReactElement {
  const messages = allMessages[language] || enMessages;

  return (
    <IntlProvider locale={language} messages={messages} defaultLocale="en">
      <CatalaSettingsProvider>
        <TraceEditor vscode={vscode} />
      </CatalaSettingsProvider>
    </IntlProvider>
  );
}
