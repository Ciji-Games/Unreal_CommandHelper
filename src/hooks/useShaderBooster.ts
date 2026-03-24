/**
 * Hook for Shader Booster panel - polls ShaderCompileWorker status for display.
 * Auto-switch priority is handled by ShaderBoosterBackground (always-on, regardless of tab).
 */

import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppActivity } from './useAppActivity';

export interface ShaderStatus {
  running: boolean;
  priority: string | null;
}

const ACTIVE_POLL_INTERVAL_MS = 1000;
const INACTIVE_POLL_INTERVAL_MS = 5000;

export function useShaderBooster() {
  const [status, setStatus] = useState<ShaderStatus>({ running: false, priority: null });
  const [error, setError] = useState<string | null>(null);
  const isAppActive = useAppActivity();

  const refreshStatus = useCallback(async () => {
    try {
      const result = await invoke<{ running: boolean; priority: string | null }>(
        'get_shader_worker_status'
      );
      setStatus({
        running: result.running,
        priority: result.priority ?? null,
      });
      setError(null);
    } catch (e) {
      setStatus({ running: false, priority: null });
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(
      refreshStatus,
      isAppActive ? ACTIVE_POLL_INTERVAL_MS : INACTIVE_POLL_INTERVAL_MS
    );
    return () => clearInterval(interval);
  }, [refreshStatus, isAppActive]);

  const setPriority = useCallback(async (priority: string) => {
    try {
      await invoke('set_shader_worker_priority', { priority });
      setError(null);
      await refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [refreshStatus]);

  return {
    status,
    error,
    refreshStatus,
    setPriority,
  };
}
