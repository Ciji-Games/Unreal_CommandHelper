/**
 * Engines context - shared engine state loaded once at app startup.
 * Merges registry engines with custom engines from settings, filters disabled.
 * Prevents re-scanning when switching tabs.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '../hooks/useSettings';
import type { EngineEntry } from '../types';

interface EnginesContextValue {
  /** Engines visible in Launcher and dropdowns (excludes disabled) */
  engines: EngineEntry[];
  /** All engines including disabled (for Settings panel - user can re-enable) */
  allEngines: EngineEntry[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const EnginesContext = createContext<EnginesContextValue | null>(null);

export function EnginesProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const [engines, setEngines] = useState<EngineEntry[]>([]);
  const [allEngines, setAllEngines] = useState<EngineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEngines = useCallback(async () => {
    try {
      setLoading(true);
      const registryEngines = await invoke<EngineEntry[]>('get_installed_engine_paths');
      const disabledSet = new Set(settings.disabledEnginePaths);

      const registryMapped = registryEngines.map((e) => ({
        ...e,
        displayName: e.displayName ?? undefined,
        isCustom: false,
        id: e.id ?? e.editorPath,
      }));

      const customEngines: EngineEntry[] = (settings.customEngines ?? [])
        .filter((c) => c.enabled !== false)
        .map((c) => ({
          version: c.version,
          editorPath: c.editorPath,
          displayName: c.displayName,
          isCustom: true,
          id: c.id,
        }));

      const allMerged = [...registryMapped, ...customEngines];
      const filtered = allMerged.filter((e) => !disabledSet.has(e.editorPath));
      setEngines(filtered);
      setAllEngines(allMerged);
    } catch {
      setEngines([]);
      setAllEngines([]);
    } finally {
      setLoading(false);
    }
  }, [settings.customEngines, settings.disabledEnginePaths]);

  useEffect(() => {
    loadEngines();
  }, [loadEngines]);

  return (
    <EnginesContext.Provider value={{ engines, allEngines, loading, refresh: loadEngines }}>
      {children}
    </EnginesContext.Provider>
  );
}

export function useEnginesContext() {
  const ctx = useContext(EnginesContext);
  if (!ctx) throw new Error('useEnginesContext must be used within EnginesProvider');
  return ctx;
}
