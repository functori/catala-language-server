import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  readWebviewSettings,
  writeTestsUpMessage,
  writeUpMessage,
} from './generated/catala_types';
import App, { GeneralTestsUi, InputApp, TraceApp } from './App';
import './styles/index.css';
import '../node_modules/@vscode/codicons/dist/codicon.css';

export function renderUi(
  settings: unknown,
  envLanguage: string,
  fileLanguage?: string
): void {
  const vscode = acquireVsCodeApi();

  const root = createRoot(document.getElementById('root') as HTMLElement);
  root.render(
    createElement(App, {
      settings: readWebviewSettings(settings),
      envLanguage,
      fileLanguage,
      vscode,
    })
  );
  vscode.postMessage(writeUpMessage({ kind: 'Ready' }));
}

export function renderInputScopeUi(
  settings: unknown,
  envLanguage: string,
  fileLanguage: string | undefined,
  scopename: string
): void {
  const vscode = acquireVsCodeApi();
  const root = createRoot(document.getElementById('root') as HTMLElement);
  root.render(
    createElement(InputApp, {
      settings: readWebviewSettings(settings),
      envLanguage,
      fileLanguage,
      vscode,
      scopename,
    })
  );
  vscode.postMessage(writeUpMessage({ kind: 'Ready' }));
}

export function renderMacroTestsUi(
  settings: unknown,
  envLanguage: string,
  fileLanguage?: string
): void {
  const vscode = acquireVsCodeApi();
  const root = createRoot(document.getElementById('root') as HTMLElement);
  root.render(
    createElement(GeneralTestsUi, {
      settings: readWebviewSettings(settings),
      envLanguage,
      fileLanguage,
      vscode,
    })
  );
  vscode.postMessage(writeTestsUpMessage({ kind: 'Ready' }));
}

export function renderTraceUi(
  settings: unknown,
  envLanguage: string,
  fileLanguage?: string
): void {
  const vscode = acquireVsCodeApi();
  const root = createRoot(document.getElementById('root') as HTMLElement);
  root.render(
    createElement(TraceApp, {
      settings: readWebviewSettings(settings),
      envLanguage,
      fileLanguage,
      vscode,
    })
  );
  // `ready` message sent by the component
}
