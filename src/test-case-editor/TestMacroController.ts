import * as vscode from 'vscode';
import type {
  TestScopeResult,
  TestSum,
  TestDebugger,
} from '../generated/catala_types';
import {
  readUpMessage,
  writeDownMessage,
  type DownMessage,
  type TestRunResults,
} from '../generated/catala_types';
import type { LanguageClient } from 'vscode-languageclient/node';
import { listEntrypoints } from '../extension/lspRequests';
import { logger } from '../extension/logger';
import {
  atdToCatala,
  clerkRunScope,
  runTestScope,
} from './testCaseCompilerInterop';
import {
  getLanguageFromUri,
  parseContents,
  testScopePicker,
} from '../extension/testCaseEditorProvider';
import path from 'path';
import { CatalaTestCaseDocument } from '../shared/CatalaTestCaseDocument';
import PQueue from 'p-queue';

// This class contains the 'backend' part of the test case editor that
// sets up the UI, provide initial data and exchanges messages with the
// web view whose entry point is in `uiEntryPoint.ts`
export class TestMacroController {
  panel: vscode.WebviewPanel;
  tests: TestDebugger[] = [];

  private testQueue: PQueue = new PQueue({ concurrency: 1 });

  // We want to restrict shell -> webview messages to instances
  // of DownMessage
  postMessageToWebView(message: DownMessage): void {
    this.panel.webview.postMessage(writeDownMessage(message));
  }

  public createWebView(
    client: LanguageClient,
    context: vscode.ExtensionContext
  ): void {
    this.panel = vscode.window.createWebviewPanel(
      'debugAllTests',
      'Catala debug tests',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );
    this.panel.title = 'Catala debug tests';
    this.panel.webview.html = this.getHtmlForWebview(this.panel, context);

    this.panel.webview.onDidReceiveMessage(async (message: unknown) => {
      const typed_msg = readUpMessage(message);
      switch (typed_msg.kind) {
        case 'Ready': {
          this.tests = [];
          const entrypoints = await listEntrypoints(
            client,
            [{ kind: 'Test' }, { kind: 'GUI' }],
            undefined,
            false,
            true
          );
          for (let index = 0; index < entrypoints.length; index++) {
            const e = entrypoints[index];
            const filename = e.path;
            if (e.entrypoint.kind == 'Test') {
              switch (e.entrypoint.value.kind) {
                case 'GUI': {
                  let uri = vscode.Uri.file(filename);
                  let lang = getLanguageFromUri(uri);
                  let content = new Uint8Array(
                    await vscode.workspace.fs.readFile(uri)
                  );
                  let res = parseContents(content, uri, lang);
                  switch (res.kind) {
                    case 'Results': {
                      res.value.forEach((test, _) => {
                        let testGui: TestDebugger = {
                          filename,
                          // Reflect the last recorded run outcome: 'Success' /
                          // 'Failed' when known, 'Unknown' when never run.
                          success:
                            test.test_success === undefined
                              ? { kind: 'Unknown' }
                              : test.test_success
                                ? { kind: 'Success' }
                                : { kind: 'Failed' },
                          test: { kind: 'GUI', value: test },
                        };
                        this.tests.push(testGui);
                      });
                      break;
                    }
                    case 'ParseError':
                      vscode.window.showErrorMessage(
                        `parseTestFile: can't parse the tests from ${filename}`
                      );
                      break;
                    case 'EmptyTestListMismatch':
                      logger.log(`No test recorder for ${path}`);
                      break;
                  }
                  break;
                }
                case 'Test': {
                  let testing_scope: string = e.entrypoint.value.value.scope;
                  let descrFilname = path.basename(filename);
                  let testSum: TestSum = {
                    testing_scope,
                    description: `Test of ${testing_scope} at ${descrFilname}`,
                    title: testing_scope,
                  };
                  let test: TestDebugger = {
                    filename,
                    success: { kind: 'Unknown' },
                    test: { kind: 'Test', value: testSum },
                  };
                  this.tests.push(test);
                  break;
                }
              }
            } else {
              throw new Error(`Unexpected test from ${path}`);
            }
          }
          this.postMessageToWebView({ kind: 'AllTests', value: this.tests });
          break;
        }
        case 'SpecificTestRequest': {
          let id = typed_msg.value;
          let test = this.tests[id];
          let uri = vscode.Uri.file(test.filename);
          await this.testQueue.add(async () => {
            if (test.test.kind == 'GUI') {
              let content = new Uint8Array(
                await vscode.workspace.fs.readFile(uri)
              );
              let lang = getLanguageFromUri(uri);
              let res = parseContents(content, uri, lang);
              if (res.kind === 'Results') {
                let index = res.value.findIndex(
                  (t) =>
                    t.title === test.test.value.title &&
                    t.testing_scope === test.test.value.testing_scope
                );
                let scope = test.test.value.testing_scope;
                const results: TestRunResults = runTestScope(
                  test.filename,
                  scope
                );
                let success =
                  results.kind == 'Ok' && !results.value.assert_failures;
                let newTest = res.value[index];
                let date = new Date();
                let test_date = `${date.getDate()}/${date.getMonth()}/${date.getFullYear()}`;
                let updatedTest = {
                  ...newTest,
                  test_success: success,
                  test_date,
                };
                res.value[index] = updatedTest;
                let content = atdToCatala(res.value, lang);
                await vscode.workspace.fs.writeFile(
                  uri,
                  Buffer.from(content, 'utf-8')
                );
                let result: TestScopeResult = {
                  kind: 'GuiTest',
                  value: [updatedTest, success],
                };
                this.postMessageToWebView({
                  kind: 'TestScopeResult',
                  value: [result, id],
                });
              }
            } else {
              const result: TestScopeResult = clerkRunScope(
                test.filename,
                test.test.value.testing_scope
              );
              this.postMessageToWebView({
                kind: 'TestScopeResult',
                value: [result, id],
              });
            }
          });
          break;
        }
        case 'OpenInTestEditor': {
          let uri: vscode.Uri = vscode.Uri.parse(typed_msg.value);
          await vscode.commands.executeCommand(
            'vscode.openWith',
            uri,
            'catala.testCaseEditor'
          );
          break;
        }
        case 'OpenInTextEditor': {
          if (typed_msg.value) {
            let uri = vscode.Uri.parse(typed_msg.value.value);
            vscode.commands.executeCommand('vscode.openWith', uri, 'default');
          }
          break;
        }
        case 'OpenTestScopePicker': {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            logger.log('No workspace folder open');
            break;
          }
          let uri: vscode.Uri | undefined;
          let defaultUri = vscode.Uri.joinPath(
            workspaceFolder.uri,
            'test.catala_fr'
          );
          // This loop only finishes if the fileName created by the user contains the
          // string "test". Otherwise, we can't open the Catala Test Case Editor properly
          // later.
          for (;;) {
            uri = await vscode.window.showSaveDialog({
              defaultUri,
              saveLabel: vscode.l10n.t('Create test file'),
              filters: {
                Catala: ['catala_fr', 'catala_en', 'catala_pl'],
              },
            });
            if (!uri) {
              // User cancelled the dialog.
              break;
            }
            const fileName = path.basename(uri.fsPath).toLowerCase();
            if (fileName.includes('test')) {
              // FileName includes test, the Catala Test Case Editor will be
              // properly displayed so we can exit the infinite loop.
              break;
            }
            await vscode.window.showErrorMessage(
              vscode.l10n.t('Invalid test file name'),
              {
                modal: true,
                detail: vscode.l10n.t(
                  'The test file name must contain the word "test".'
                ),
              }
            );
            // Re-open the dialog on the rejected file so the user can fix it.
            defaultUri = uri;
          }
          if (!uri) {
            // User cancelled the dialog.
            break;
          }
          await vscode.workspace.fs.writeFile(uri, Buffer.from('', 'utf-8'));
          let document = await CatalaTestCaseDocument.create(uri, undefined);
          let result = await testScopePicker(document);
          let catalaSource = atdToCatala(result, document.language);
          await vscode.workspace.fs.writeFile(
            uri,
            Buffer.from(catalaSource, 'utf-8')
          );
          await vscode.commands.executeCommand(
            'vscode.openWith',
            uri,
            'catala.testCaseEditor'
          );
          break;
        }
      }
    });
  }

  private getHtmlForWebview(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext
  ): string {
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'dist', 'ui.js')
    );

    const language = 'fr';

    return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Check all tests</title>
                <style>
                    body {
                        padding: 100px;
                    }
                </style>
            </head>
            <body>
                <div id="root"></div>
            </body>
            <script src="${scriptUri}"></script>
            <script>
              window.Ui.renderMacroTestsUi("${language}");
            </script>
            </html>
        `;
  }
}
