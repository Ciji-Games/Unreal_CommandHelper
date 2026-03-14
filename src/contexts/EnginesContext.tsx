/**
 * Engines context - shared engine state loaded once at app startup.
 * Validates that engines still exist on disk (backend filters via registry + path checks).
 * Prevents re-scanning when switching tabs.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { EngineEntry } from '../types';

interface EnginesContextValue {
  engines: EngineEntry[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const EnginesContext = createContext<EnginesContextValue | null>(null);

export function EnginesProvider({ children }: { children: React.ReactNode }) {
  const [engines, setEngines] = useState<EngineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEngines = useCallback(async () => {
    try {
      setLoading(true);
      const e = await invoke<EngineEntry[]>('get_installed_engine_paths');
      setEngines(e);
    } catch {
      setEngines([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEngines();
  }, [loadEngines]);

  return (
    <EnginesContext.Provider value={{ engines, loading, refresh: loadEngines }}>
      {children}
    </EnginesContext.Provider>
  );
}

export function useEnginesContext() {
  const ctx = useContext(EnginesContext);
  if (!ctx) throw new Error('useEnginesContext must be used within EnginesProvider');
  return ctx;
}
