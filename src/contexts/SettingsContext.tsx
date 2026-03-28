/**
 * Settings context - provides app settings to the whole tree.
 * Ensures all consumers see the same state when settings change.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { getStore } from '../hooks/useStore';
import { STORE_KEYS, DEFAULT_SETTINGS } from '../config';
import type { CustomEngineEntry } from '../types';

export interface AppSettings {
  unrealVersionSelectorPath: string;
  autoSwitchBooster: boolean;
  priorityBooster: number;
  startWithWindows: boolean;
  notificationOnComplete: boolean;
  customEngines: CustomEngineEntry[];
  disabledEnginePaths: string[];
  projectEngineOverrides: Record<string, string>;
  defaultEngineByVersion: Record<string, string>;
  preferredIdeId: string;
}

interface SettingsContextValue {
  settings: AppSettings;
  loading: boolean;
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  refresh: () => Promise<void>;
  isAutostartEnabled: () => Promise<boolean>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const storeKeyMap: Record<keyof AppSettings, string> = {
  unrealVersionSelectorPath: STORE_KEYS.UNREAL_VERSION_SELECTOR_PATH,
  autoSwitchBooster: STORE_KEYS.AUTO_SWITCH_BOOSTER,
  priorityBooster: STORE_KEYS.PRIORITY_BOOSTER,
  startWithWindows: STORE_KEYS.START_WITH_WINDOWS,
  notificationOnComplete: STORE_KEYS.NOTIFICATION_ON_COMPLETE,
  customEngines: STORE_KEYS.CUSTOM_ENGINES,
  disabledEnginePaths: STORE_KEYS.DISABLED_ENGINE_PATHS,
  projectEngineOverrides: STORE_KEYS.PROJECT_ENGINE_OVERRIDES,
  defaultEngineByVersion: STORE_KEYS.DEFAULT_ENGINE_BY_VERSION,
  preferredIdeId: STORE_KEYS.PREFERRED_IDE_ID,
};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>({
    ...DEFAULT_SETTINGS,
    customEngines: [],
    disabledEnginePaths: [],
    projectEngineOverrides: {},
    defaultEngineByVersion: {},
    preferredIdeId: '',
  });
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      const store = await getStore();
      const [
        path,
        autoSwitch,
        priority,
        startWithWindows,
        notificationOnComplete,
        customEngines,
        disabledEnginePaths,
        projectEngineOverrides,
        defaultEngineByVersion,
        preferredIdeId,
      ] = await Promise.all([
        store.get<string>(STORE_KEYS.UNREAL_VERSION_SELECTOR_PATH),
        store.get<boolean>(STORE_KEYS.AUTO_SWITCH_BOOSTER),
        store.get<number>(STORE_KEYS.PRIORITY_BOOSTER),
        store.get<boolean>(STORE_KEYS.START_WITH_WINDOWS),
        store.get<boolean>(STORE_KEYS.NOTIFICATION_ON_COMPLETE),
        store.get<CustomEngineEntry[]>(STORE_KEYS.CUSTOM_ENGINES),
        store.get<string[]>(STORE_KEYS.DISABLED_ENGINE_PATHS),
        store.get<Record<string, string>>(STORE_KEYS.PROJECT_ENGINE_OVERRIDES),
        store.get<Record<string, string>>(STORE_KEYS.DEFAULT_ENGINE_BY_VERSION),
        store.get<string>(STORE_KEYS.PREFERRED_IDE_ID),
      ]);

      setSettingsState({
        unrealVersionSelectorPath: path ?? DEFAULT_SETTINGS.unrealVersionSelectorPath,
        autoSwitchBooster: autoSwitch ?? DEFAULT_SETTINGS.autoSwitchBooster,
        priorityBooster: priority ?? DEFAULT_SETTINGS.priorityBooster,
        startWithWindows: startWithWindows ?? DEFAULT_SETTINGS.startWithWindows,
        notificationOnComplete: notificationOnComplete ?? DEFAULT_SETTINGS.notificationOnComplete,
        customEngines: customEngines ?? DEFAULT_SETTINGS.customEngines,
        disabledEnginePaths: disabledEnginePaths ?? DEFAULT_SETTINGS.disabledEnginePaths,
        projectEngineOverrides: projectEngineOverrides ?? DEFAULT_SETTINGS.projectEngineOverrides,
        defaultEngineByVersion: defaultEngineByVersion ?? DEFAULT_SETTINGS.defaultEngineByVersion,
        preferredIdeId: preferredIdeId ?? DEFAULT_SETTINGS.preferredIdeId,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const setSetting = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      const store = await getStore();
      const storeKey = storeKeyMap[key];
      await store.set(storeKey, value);
      setSettingsState((prev) => ({ ...prev, [key]: value }));

      if (key === 'startWithWindows') {
        try {
          if (value) {
            await enable();
          } else {
            disable();
          }
        } catch (e) {
          console.error('Failed to update autostart:', e);
        }
      }
    },
    []
  );

  const isAutostartEnabled = useCallback(async () => {
    try {
      return await isEnabled();
    } catch {
      return false;
    }
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        loading,
        setSetting,
        refresh: loadSettings,
        isAutostartEnabled,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettingsContext must be used within SettingsProvider');
  return ctx;
}
