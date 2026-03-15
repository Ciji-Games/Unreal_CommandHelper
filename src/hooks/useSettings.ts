/**
 * Hook for settings - uses SettingsContext.
 */

import { useSettingsContext } from '../contexts/SettingsContext';

export type { AppSettings } from '../contexts/SettingsContext';

export function useSettings() {
  return useSettingsContext();
}
