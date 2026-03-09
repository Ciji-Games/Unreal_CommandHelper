/**
 * Shader Booster background - runs process check and auto-priority regardless of tab.
 * Always mounted at app level so it works even when the Shader Booster panel is not open.
 */

import { useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '../hooks/useSettings';

const POLL_INTERVAL_MS = 2000;

export function ShaderBoosterBackground() {
  const { settings } = useSettings();

  const checkAndApply = useCallback(async () => {
    try {
      const result = await invoke<{ running: boolean; priority: string | null }>(
        'get_shader_worker_status'
      );
      if (result.running && settings.autoSwitchBooster) {
        const priorityStr = String(settings.priorityBooster);
        try {
          await invoke('set_shader_worker_priority', { priority: priorityStr });
        } catch {
          // Ignore - may fail if process exited between polls
        }
      }
    } catch {
      // Ignore - background tool, don't surface errors
    }
  }, [settings.autoSwitchBooster, settings.priorityBooster]);

  useEffect(() => {
    checkAndApply();
    const interval = setInterval(checkAndApply, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkAndApply]);

  return null;
}
