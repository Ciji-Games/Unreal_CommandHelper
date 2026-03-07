/**
 * Hook for settings persistence - unrealVersionSelectorPath, autoSwitchBooster, priorityBooster.
 */

import { useState, useEffect, useCallback } from 'react';
import { getStore } from './useStore';
import { STORE_KEYS, DEFAULT_SETTINGS } from '../config';

export interface AppSettings {
  unrealVersionSelectorPath: string;
  autoSwitchBooster: boolean;
  priorityBooster: number;
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      const store = await getStore();
      const path = await store.get<string>(STORE_KEYS.UNREAL_VERSION_SELECTOR_PATH);
      const autoSwitch = await store.get<boolean>(STORE_KEYS.AUTO_SWITCH_BOOSTER);
      const priority = await store.get<number>(STORE_KEYS.PRIORITY_BOOSTER);
      setSettingsState({
        unrealVersionSelectorPath: path ?? DEFAULT_SETTINGS.unrealVersionSelectorPath,
        autoSwitchBooster: autoSwitch ?? DEFAULT_SETTINGS.autoSwitchBooster,
        priorityBooster: priority ?? DEFAULT_SETTINGS.priorityBooster,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const storeKeyMap: Record<keyof AppSettings, string> = {
    unrealVersionSelectorPath: STORE_KEYS.UNREAL_VERSION_SELECTOR_PATH,
    autoSwitchBooster: STORE_KEYS.AUTO_SWITCH_BOOSTER,
    priorityBooster: STORE_KEYS.PRIORITY_BOOSTER,
  };

  const setSetting = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      const store = await getStore();
      const storeKey = storeKeyMap[key];
      await store.set(storeKey, value);
      setSettingsState((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  return {
    settings,
    loading,
    setSetting,
    refresh: loadSettings,
  };
}
