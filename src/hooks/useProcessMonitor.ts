/**
 * Reusable hook for process monitoring.
 * Use with predefined groups (e.g. "regenerate") to check if blocking processes are running.
 */

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ProcessStatus } from '../types';

export function useProcessMonitor(groupName: string, pollIntervalMs = 1000) {
  const [statuses, setStatuses] = useState<ProcessStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkProcesses = async () => {
      try {
        const result = await invoke<ProcessStatus[]>('get_process_status', {
          groupName,
        });
        if (!cancelled) {
          setStatuses(result);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setStatuses([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkProcesses();
    const interval = setInterval(checkProcesses, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [groupName, pollIntervalMs]);

  const runningProcesses = statuses.filter((s) => s.isRunning);
  const hasBlockingProcesses = runningProcesses.length > 0;

  return {
    statuses,
    runningProcesses,
    hasBlockingProcesses,
    loading,
    error,
  };
}
