import {
  type ReactElement,
  type ReactNode,
  createContext,
  useEffect,
  useState,
} from 'react';
import type { CatalaSettings } from './settings';
import { defaultSettings, isSettingsMessage } from './settings';

const SettingsContext = createContext<CatalaSettings>(defaultSettings);

export function CatalaSettingsProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [settings, setSettings] = useState<CatalaSettings>(defaultSettings);
  useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      if (isSettingsMessage(event.data)) {
        setSettings(event.data.value);
      }
    };
    window.addEventListener('message', handleMessage);
    return (): void => window.removeEventListener('message', handleMessage);
  }, []);
  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}
