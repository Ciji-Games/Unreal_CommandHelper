/**
 * Store keys and default values
 */

export const STORE_PATH = 'ue-launcher-store.json';

export const STORE_KEYS = {
  PROJECTS: 'projects',
  UNREAL_VERSION_SELECTOR_PATH: 'unrealVersionSelectorPath',
  AUTO_SWITCH_BOOSTER: 'autoSwitchBooster',
  PRIORITY_BOOSTER: 'priorityBooster',
} as const;

export const DEFAULT_SETTINGS = {
  unrealVersionSelectorPath: '',
  autoSwitchBooster: false,
  priorityBooster: 0, // 0=BelowNormal, 1=Normal, 2=AboveNormal, 3=High
} as const;
