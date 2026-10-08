export type LanguageSetting = 'default' | 'en' | 'fr' | 'pl' | 'file';

const LANGUAGE_SETTINGS: readonly LanguageSetting[] = [
  'default',
  'en',
  'fr',
  'pl',
  'file',
];

export const TRACE_VIEW_KINDS = [
  'function_call',
  'branch_condition',
  'if_branching',
  'match_branching',
  'assertion',
  'exception',
  'error',
] as const;

export type TraceViewKind = (typeof TRACE_VIEW_KINDS)[number];

export type TraceViewSettings = Record<TraceViewKind, boolean>;

export type CatalaSettings = {
  language: LanguageSetting;
  traceView: TraceViewSettings;
};

export const defaultSettings: CatalaSettings = {
  language: 'default',
  traceView: Object.fromEntries(
    TRACE_VIEW_KINDS.map((kind) => [kind, true])
  ) as TraceViewSettings,
};

export function showsTraceKind(
  settings: CatalaSettings,
  kind: string
): boolean {
  return (TRACE_VIEW_KINDS as readonly string[]).includes(kind)
    ? settings.traceView[kind as TraceViewKind]
    : true;
}

export type SettingsMessage = {
  kind: 'catalaSettings';
  value: CatalaSettings;
  locale: string;
};

export function isSettingsMessage(data: unknown): data is SettingsMessage {
  return (
    data !== null &&
    typeof data === 'object' &&
    (data as { kind?: unknown }).kind === 'catalaSettings'
  );
}

const SUPPORTED_LANGUAGES = ['en', 'fr', 'pl'];

function primarySubtag(locale: string): string {
  return locale.split(/[-_]/)[0].toLowerCase();
}

export function fileLanguage(file: string | undefined): string | undefined {
  const match = file?.match(/\.catala_([a-z]+)(?:\.md)?$/i);
  const language = match?.[1].toLowerCase();
  return language !== undefined && SUPPORTED_LANGUAGES.includes(language)
    ? language
    : undefined;
}

export function resolveLanguage(
  settings: CatalaSettings,
  file: string | undefined,
  locale: string
): string {
  switch (settings.language) {
    case 'en':
    case 'fr':
    case 'pl':
      return settings.language;
    case 'file':
      return fileLanguage(file) ?? primarySubtag(locale);
    case 'default':
      return primarySubtag(locale);
  }
}

export function readSettings(stored: unknown): CatalaSettings {
  if (stored === null || typeof stored !== 'object') {
    return defaultSettings;
  }
  const language = (stored as { language?: unknown }).language;
  const traceView = (stored as { traceView?: unknown }).traceView;
  const shown =
    traceView !== null && typeof traceView === 'object'
      ? (traceView as Record<string, unknown>)
      : {};
  return {
    language: LANGUAGE_SETTINGS.includes(language as LanguageSetting)
      ? (language as LanguageSetting)
      : defaultSettings.language,
    traceView: Object.fromEntries(
      TRACE_VIEW_KINDS.map((kind) => [
        kind,
        typeof shown[kind] === 'boolean'
          ? shown[kind]
          : defaultSettings.traceView[kind],
      ])
    ) as TraceViewSettings,
  };
}
