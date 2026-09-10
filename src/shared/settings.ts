export type LanguageSetting = 'default' | 'en' | 'fr' | 'file';

const LANGUAGE_SETTINGS: readonly LanguageSetting[] = [
  'default',
  'en',
  'fr',
  'file',
];

export type CatalaSettings = {
  language: LanguageSetting;
};

export const defaultSettings: CatalaSettings = {
  language: 'default',
};

export type SettingsMessage = {
  kind: 'catalaSettings';
  value: CatalaSettings;
};

export function isSettingsMessage(data: unknown): data is SettingsMessage {
  return (
    data !== null &&
    typeof data === 'object' &&
    (data as { kind?: unknown }).kind === 'catalaSettings'
  );
}

export function readSettings(stored: unknown): CatalaSettings {
  if (stored === null || typeof stored !== 'object') {
    return defaultSettings;
  }
  const language = (stored as { language?: unknown }).language;
  return {
    language: LANGUAGE_SETTINGS.includes(language as LanguageSetting)
      ? (language as LanguageSetting)
      : defaultSettings.language,
  };
}
