import * as vscode from 'vscode';
import type { CatalaSettings, SettingsMessage } from '../shared/settings';
import { readSettings } from '../shared/settings';

const SECTION = 'catala';

export type SettingsSource = {
  get(): CatalaSettings;
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

  public get(): CatalaSettings {
    const configuration = vscode.workspace.getConfiguration(SECTION);
    return readSettings({ language: configuration.get('language') });
  }

  public follow(webview: vscode.Webview): vscode.Disposable {
    this.webviews.add(webview);
    void this.post(webview);
    return new vscode.Disposable(() => this.webviews.delete(webview));
  }

  private async post(webview: vscode.Webview): Promise<void> {
    const message: SettingsMessage = {
      kind: 'catalaSettings',
      value: this.get(),
    };
    await webview.postMessage(message);
  }
}
