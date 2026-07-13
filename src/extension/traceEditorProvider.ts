import * as vscode from 'vscode';
import { readFileSync, readdirSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { dirname, join } from 'path';
import type { LanguageClient } from 'vscode-languageclient/node';
import { listEntrypoints } from './lspRequests';
import type { CatalaEntrypoint } from './lspRequests';
import { parseTestFile } from '../test-case-editor/testCaseCompilerInterop';
import { logger } from './logger';
import { getCwd } from '../shared/util_client';
import type { JsonValue } from '../shared/util_client';
import type {
  TraceDownMessage,
  TraceUpMessage,
} from '../trace-editor/messages';
import { readTraceFile, runTrace } from '../trace-editor/traceRunner';
import type { TraceElement } from '../trace-editor/traceUtils';
import type { ParseResults, Test } from '../generated/catala_types';
import { writeTest } from '../generated/catala_types';

const fileLineCache = new Map<string, string>();

// Cache of `testcase read` results, keyed by file + scope. Each key holds a list
// of entries, one per `_build` state: an entry stores a hash of the `_build`
// folder it was parsed against (matched to reuse a result, e.g. after switching
// branches back to a previous build) and the time it was cached (entries older
// than 24h are discarded).
type ReadTestCacheEntry = {
  hash: string;
  result: ParseResults;
  date: number;
};
const readTestCache = new Map<string, ReadTestCacheEntry[]>();

/** Cache entries older than this are discarded. */
const READ_TEST_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Signature of the `_build` folder: a hash over every file's path, size and
 * modification time (no file contents are read). Detects recompilations.
 */
function hashBuildDir(dir: string): string {
  const h = createHash('sha1');
  const walk = (d: string): void => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
      } else {
        try {
          const st = statSync(p);
          h.update(p).update(String(st.size)).update(String(st.mtimeMs));
        } catch {
          /* ignore unreadable entries */
        }
      }
    }
  };
  walk(dir);
  return h.digest('hex');
}

/**
 * Run `testcase read` for a scope, caching by file + scope. The cache is
 * invalidated when the `_build` folder changes.
 */
function cachedReadTests(
  content: string,
  file: string,
  lang: string | undefined,
  scope: string | undefined
): ParseResults {
  const cwd = getCwd(file) ?? dirname(file);
  const hash = hashBuildDir(join(cwd, '_build'));
  const key = `${file} ${scope ?? ''}`;
  const now = Date.now();
  // A matching build hash is always valid, whatever its age; the date only
  // trims non-matching entries once they are more than 24h old.
  const entries = (readTestCache.get(key) ?? []).filter(
    (e) => e.hash === hash || now - e.date < READ_TEST_CACHE_TTL_MS
  );
  const hit = entries.find((e) => e.hash === hash);
  if (hit !== undefined) {
    readTestCache.set(key, entries);
    return hit.result;
  }
  const result = parseTestFile(content, file, lang, scope);
  entries.push({ hash, result, date: now });
  readTestCache.set(key, entries);
  return result;
}

function extractLine(file: string, line: number): string | null {
  const key = `${file}:${line}`;
  const cached = fileLineCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let lines: string[];
  try {
    lines = readFileSync(file, 'utf8').split(/\r?\n/);
  } catch {
    return null;
  }
  if (line < 1 || line > lines.length) {
    return null;
  }
  const text = lines[line - 1];
  fileLineCache.set(key, text);
  return text;
}

function scopeName(e: CatalaEntrypoint): string {
  const k = e.entrypoint;
  if (k.kind === 'Test') {
    return k.value.value.scope;
  } else {
    return k.value.scope;
  }
}

/** Optional inputs for opening the trace editor on a file. */
export type TraceEditorInputs = {
  /** Scope to preselect and run the trace on. */
  scope?: string;
  /**
   * Full test to run the trace on. When given, its scope is inferred and the
   * file does not need to be listed/parsed to recover the test information.
   */
  test?: Test;
  /**
   * Locale for the webview UI (e.g. `"en"`, `"fr"`). When omitted, it is
   * derived from the file's `.catala_<lang>` extension.
   */
  language?: string;
  /** Pre-computed trace to display directly, without running. */
  trace?: TraceElement[];
  /** When true, run the trace immediately on load. */
  run?: boolean;
};

export class TraceEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'catala.traceEditor';

  /** Inputs staged for the next `resolveCustomTextEditor` of a given file. */
  private static readonly pendingInputs = new Map<string, TraceEditorInputs>();

  /** Open the trace editor for `uri`, passing optional inputs to it. */
  public static openWith(
    uri: vscode.Uri,
    inputs: TraceEditorInputs
  ): Thenable<unknown> {
    TraceEditorProvider.pendingInputs.set(uri.fsPath, inputs);
    return vscode.commands.executeCommand(
      'vscode.openWith',
      uri,
      TraceEditorProvider.viewType
    );
  }

  public static register(
    context: vscode.ExtensionContext,
    getClient: () => LanguageClient | undefined,
    codiconsCssPath: string
  ): vscode.Disposable {
    const provider = new TraceEditorProvider(
      context,
      getClient,
      codiconsCssPath
    );
    logger.log(`Registering ${TraceEditorProvider.viewType}`);
    return vscode.window.registerCustomEditorProvider(
      TraceEditorProvider.viewType,
      provider,
      {
        supportsMultipleEditorsPerDocument: true,
        webviewOptions: { retainContextWhenHidden: true },
      }
    );
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getClient: () => LanguageClient | undefined,
    /** dist-relative path to the emitted `codicon.css`. */
    private readonly codiconsCssPath: string
  ) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const webview = webviewPanel.webview;
    webview.options = { enableScripts: true };

    const file = document.uri.fsPath;
    // Consume any inputs staged for this file when it was opened.
    const inputs = TraceEditorProvider.pendingInputs.get(file);
    TraceEditorProvider.pendingInputs.delete(file);

    // Resolve the webview UI locale: use the explicit input if given, otherwise
    // derive it from the file's `.catala_<lang>` extension, falling back to the
    // VS Code display language.
    const language =
      inputs?.language ??
      file.match(/\.catala_(\w+)/)?.[1] ??
      vscode.env.language;
    webview.html = this.getHtmlForWebview(webview, language);

    function postToWebView(message: TraceDownMessage): void {
      webview.postMessage(message);
    }

    webviewPanel.webview.onDidReceiveMessage(async (raw: unknown) => {
      const message = raw as TraceUpMessage;
      switch (message.kind) {
        case 'ready': {
          let scopesWithInfo: Map<string, Test | undefined> = new Map();
          let scope = inputs?.scope;
          if (inputs?.test) {
            // A test was provided directly: its scope is the entrypoint, and we
            // already have its information, so there is no need to list scopes
            // or re-parse the file.
            const test = inputs.test;
            scope = test.testing_scope;
            scopesWithInfo = new Map([[test.testing_scope, test]]);
          } else {
            const client = this.getClient();
            if (client) {
              try {
                const entrypoints = await listEntrypoints(
                  client,
                  [{ kind: 'Test' }, { kind: 'GUI' }, { kind: 'NoInputScope' }],
                  file,
                  false,
                  true
                );
                const scopes = entrypoints.map(scopeName);
                // Derive the language from the file extension (`.catala_<lang>`).
                const lang = file.match(/\.catala_(\w+)/)?.[1];
                const parsed = cachedReadTests(
                  document.getText(),
                  file,
                  lang,
                  scope
                );
                if (parsed.kind === 'Results') {
                  scopesWithInfo = new Map(
                    scopes.map((s) => [
                      s,
                      parsed.value.find((t) => t.testing_scope == s),
                    ])
                  );
                } else {
                  scopesWithInfo = new Map(scopes.map((s) => [s, undefined]));
                  logger.log(
                    `Trace editor: could not parse tests (${parsed.kind}).`
                  );
                }
              } catch (e) {
                logger.log(`Trace editor: could not list scopes: ${String(e)}`);
              }
            }
          }
          postToWebView({
            kind: 'init',
            file,
            cwd: getCwd(file) ?? '',
            // Serialize each Test (its Maps do not survive postMessage as-is).
            scopes: [...scopesWithInfo].map(
              ([s, test]): [string, JsonValue] => [
                s,
                test ? (writeTest(test) as JsonValue) : null,
              ]
            ),
            scope,
            trace: inputs?.trace,
            run: inputs?.run,
          });
          break;
        }
        case 'run': {
          const scope = message.scope.trim();
          if (!scope) {
            postToWebView({
              kind: 'result',
              ok: false,
              error: 'No scope selected.',
            });
            return;
          }
          const result = await runTrace(file, scope);
          postToWebView({ kind: 'result', ...result });
          break;
        }
        case 'loadFile': {
          const path = message.path.trim();
          if (!path) {
            postToWebView({
              kind: 'result',
              ok: false,
              error: 'No trace file path provided.',
            });
            return;
          }
          postToWebView({ kind: 'result', ...readTraceFile(path) });
          break;
        }
        case 'openLocation': {
          // Positions in the trace are 1-based; VS Code positions are 0-based.
          const range = new vscode.Range(
            new vscode.Position(
              Math.max(0, message.start.line - 1),
              Math.max(0, message.start.character - 1)
            ),
            new vscode.Position(
              Math.max(0, message.end.line - 1),
              Math.max(0, message.end.character - 1)
            )
          );
          try {
            const doc = await vscode.workspace.openTextDocument(
              vscode.Uri.file(message.file)
            );
            await vscode.window.showTextDocument(doc, {
              selection: range,
              preview: false,
            });
          } catch (e) {
            vscode.window.showErrorMessage(
              `Cannot open ${message.file}: ${String(e)}`
            );
          }
          break;
        }
        case 'requestExtract': {
          const text = extractLine(message.file, message.line);
          postToWebView({ kind: 'extract', id: message.id, text });
          break;
        }
      }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview, language: string): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'ui.js')
    );
    // vscode-elements' icon component looks up this stylesheet by id to load
    // the Codicons font into its shadow DOM.
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'dist',
        this.codiconsCssPath
      )
    );
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Catala Trace Editor</title>
        <link href="${codiconsUri}" id="vscode-codicon-stylesheet" rel="stylesheet" />
        <style>
          body { padding: 10px; }
        </style>
      </head>
      <body>
        <div id="root"></div>
      </body>
      <script src="${scriptUri}"></script>
      <script>
        window.Ui.renderTraceUi("${language}");
      </script>
      </html>
    `;
  }
}
