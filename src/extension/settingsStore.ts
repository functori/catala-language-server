import * as vscode from 'vscode';
import {
  readLanguageSettings,
  readTraceViewKinds,
  type WebviewSettings,
  writeDownMessage,
} from '../generated/catala_types';
import { defaultSettings } from '../shared/settings';
import { logger } from './logger';

const SECTION = 'catala';

// An invalid setting (e.g. a value from an older version of the extension)
// falls back to its default instead of failing every webview
function readOr<T>(
  name: string,
  read: (x: unknown) => T,
  raw: unknown,
  fallback: T
): T {
  try {
    return read(raw);
  } catch (e) {
    logger.log(
      `Could not read setting ${SECTION}.${name} = ${JSON.stringify(raw)} (${String(e)}): using ${JSON.stringify(fallback)} instead.`
    );
    return fallback;
  }
}

export type SettingsSource = {
  get(): WebviewSettings;
  follow(webview: vscode.Webview): vscode.Disposable;
};

export class SettingsStore implements SettingsSource {
  private readonly webviews = new Set<vscode.Webview>();

  constructor(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration(SECTION)) {
          return;
        }
        for (const webview of this.webviews) {
          void this.post(webview);
        }
      })
    );
  }

  public get(): WebviewSettings {
    const configuration = vscode.workspace.getConfiguration(SECTION);
    return {
      language: readOr(
        'language',
        readLanguageSettings,
        configuration.get('language'),
        defaultSettings.language
      ),
      trace_view: readOr(
        'traceView',
        readTraceViewKinds,
        configuration.get('traceView'),
        defaultSettings.trace_view
      ),
    };
  }

  public follow(webview: vscode.Webview): vscode.Disposable {
    this.webviews.add(webview);
    void this.post(webview);
    return new vscode.Disposable(() => this.webviews.delete(webview));
  }

  private async post(webview: vscode.Webview): Promise<void> {
    await webview.postMessage(
      writeDownMessage({
        kind: 'Settings',
        value: this.get(),
      })
    );
  }
}
