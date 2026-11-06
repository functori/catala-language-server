import {
  type WebviewSettings,
  type TraceViewKinds,
} from '../generated/catala_types';
import enMessages from '../locales/en.json';
import frMessages from '../locales/fr.json';
import plMessages from '../locales/pl.json';

export const allMessages: Record<string, Record<string, string>> = {
  en: enMessages,
  fr: frMessages,
  pl: plMessages,
};

export const defaultSettings: WebviewSettings = {
  language: { kind: 'File' }, // the default of `catala.language` in package.json
  trace_view: {
    function_call: false,
    branch_condition: false,
    if_branching: false,
    match_branching: false,
    assertion_: false,
    exception_: false,
    error: false,
  },
};

export function showsTraceKind(
  settings: WebviewSettings,
  kind: string
): boolean {
  // `assertion`/`exception` are OCaml keywords: the ATD fields end with `_`
  const key = kind === 'assertion' || kind === 'exception' ? `${kind}_` : kind;
  return isTraceKindKey(settings.trace_view, key)
    ? settings.trace_view[key]
    : // kinds without a setting are always shown
      true;
}

function isTraceKindKey(
  traceView: TraceViewKinds,
  key: string
): key is keyof TraceViewKinds {
  return Object.hasOwn(traceView, key);
}

function primarySubtag(locale: string): string {
  return locale.split(/[-_]/)[0].toLowerCase();
}

export function fileLanguage(file: string | undefined): string | undefined {
  const match = file?.match(/\.catala_([a-z]+)(?:\.md)?$/i);
  const language = match?.[1].toLowerCase();
  return language !== undefined && language in allMessages
    ? language
    : undefined;
}

export function resolveLanguage(
  settings: WebviewSettings,
  file_language: string | undefined,
  env_language: string
): string {
  switch (settings.language.kind) {
    case 'File':
      return file_language ?? primarySubtag(env_language);
    case 'Vscode':
      return primarySubtag(env_language);
  }
}
