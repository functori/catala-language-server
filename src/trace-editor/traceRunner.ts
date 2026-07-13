import * as vscode from 'vscode';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { TraceResult } from './messages';
import { traceFromJson } from './traceUtils';

export function readTraceFile(path: string): TraceResult {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const trace = traceFromJson(parsed);
    if (trace === null) {
      return { ok: false, error: 'The file does not contain a Catala trace.' };
    }
    return { ok: true, trace };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function runTrace(
  uri: string,
  scope: string
): Promise<TraceResult> {
  let tmpDir: string;
  try {
    tmpDir = mkdtempSync(join(tmpdir(), 'catala-trace-'));
  } catch (e) {
    return { ok: false, error: `Cannot create temporary file: ${String(e)}` };
  }
  const traceOutputFile = join(tmpDir, 'trace.json');
  try {
    await vscode.commands.executeCommand('catala.runScope', {
      uri,
      scope,
      withTrace: true,
      headless: true,
      traceOutputFile,
    });
    return readTraceFile(traceOutputFile);
  } catch (e) {
    return { ok: false, error: String(e) };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
