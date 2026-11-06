import {
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { IntlProvider } from 'react-intl';
import {
  type WebviewSettings,
  readDownMessage,
} from '../generated/catala_types';
import { allMessages, defaultSettings, resolveLanguage } from './settings';

const SettingsContext = createContext<WebviewSettings>(defaultSettings);

export function useCatalaSettings(): WebviewSettings {
  return useContext(SettingsContext);
}

export function CatalaSettingsProvider({
  initialSettings,
  envLanguage,
  fileLanguage,
  children,
}: {
  initialSettings: WebviewSettings;
  envLanguage: string;
  fileLanguage?: string;
  children: ReactNode;
}): ReactElement {
  const [settings, setSettings] = useState<WebviewSettings>(initialSettings);
  useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      try {
        const message = readDownMessage(event.data);
        if (message.kind === 'Settings') {
          setSettings(message.value);
        }
      } catch {
        // Posted message are not always down messages, it can be trace messages.
        // To prevent a failure, wrap the settings read with a try catch and just
        // ignore the message if it's not a down message.
      }
    };
    window.addEventListener('message', handleMessage);
    return (): void => window.removeEventListener('message', handleMessage);
  }, []);
  const language = resolveLanguage(settings, fileLanguage, envLanguage);
  const resolved = language in allMessages ? language : 'en';
  return (
    <SettingsContext.Provider value={settings}>
      <IntlProvider
        locale={resolved}
        messages={allMessages[resolved]}
        defaultLocale="en"
      >
        {children}
      </IntlProvider>
    </SettingsContext.Provider>
  );
}
