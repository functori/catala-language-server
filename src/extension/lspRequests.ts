import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { logger } from './logger';

import type {
  Entrypoint,
  EntrypointParamKind,
  EntrypointsParams,
} from '../generated/catala_types';
import {
  writeEntrypointsParams,
  readEntrypoints,
} from '../generated/catala_types';

// Atd prevents us to obtain direct vscode's ranges, we convert them here.
export type CatalaEntrypoint = Omit<Entrypoint, 'range'> & {
  range: vscode.Range;
};

export async function listEntrypoints(
  client: LanguageClient,
  only?: EntrypointParamKind[],
  path?: string,
  no_lambdas?: boolean,
  no_variables?: boolean
): Promise<Array<CatalaEntrypoint>> {
  const params: EntrypointsParams = {
    only: (only ??= []),
    path,
    no_lambdas,
    no_variables,
  };
  let ret: JSON = await client.sendRequest(
    'catala.listEntrypoints',
    writeEntrypointsParams(params)
  );
  const raw_entrypoints = readEntrypoints(ret);
  const entrypoints: Array<CatalaEntrypoint> = raw_entrypoints.map((e) => {
    const cep: CatalaEntrypoint = {
      path: e.path,
      entrypoint: e.entrypoint,
      range: new vscode.Range(
        e.range.start.line,
        e.range.start.character,
        e.range.end_.line,
        e.range.end_.character
      ),
    };
    return cep;
  });
  return entrypoints;
}

export type CheckTraceAssert = (clerk_toml_dir: string) => Promise<boolean>;

/**
 * `getClient` is a thunk: the client is only assigned when an LSP binary was
 * found, and the editor providers are registered either way.
 *
 * The server answers `null` whenever it has no clerk.toml to read the setting
 * from, which is not an error: the check is simply off.
 */
export function checkTraceAssert(
  getClient: () => LanguageClient | undefined
): CheckTraceAssert {
  return async (clerk_toml_dir: string): Promise<boolean> => {
    const client = getClient();
    if (client === undefined) return false;
    try {
      const answer = await client.sendRequest('catala.getTraceAssert', {
        clerk_toml_dir,
      });
      return answer === true;
    } catch (err) {
      logger.log(`catala.getTraceAssert failed: ${String(err)}`);
      return false;
    }
  };
}

export type ExceptionsArgs = {
  uri: string;
  scope: string;
  variable: string;
  declFile: string;
  declLine: number;
  declCol: number;
  declEndLine: number;
  declEndCol: number;
};

export async function exceptionsAt(
  client: LanguageClient,
  uri: vscode.Uri,
  position: vscode.Position
): Promise<ExceptionsArgs | null> {
  const result = await client.sendRequest<ExceptionsArgs | null>(
    'catala.exceptionsAt',
    {
      uri: uri.toString(),
      position: { line: position.line, character: position.character },
    }
  );
  return result ?? null;
}
