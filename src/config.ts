/**
 * Store keys and default values
 */

export const STORE_PATH = 'ue-launcher-store.json';

export const STORE_KEYS = {
  PROJECTS: 'projects',
  SCHEDULED_JOBS: 'scheduledJobs',
  UNREAL_VERSION_SELECTOR_PATH: 'unrealVersionSelectorPath',
  AUTO_SWITCH_BOOSTER: 'autoSwitchBooster',
  PRIORITY_BOOSTER: 'priorityBooster',
} as const;

export const DEFAULT_SETTINGS = {
  unrealVersionSelectorPath: '',
  autoSwitchBooster: false,
  priorityBooster: 0, // 0=BelowNormal, 1=Normal, 2=AboveNormal, 3=High
} as const;

/** Link entry for the Links tab. icon is optional asset key (e.g. 'ueIcon', 'cppLogo') or undefined for default. */
export interface LinkEntry {
  url: string;
  label: string;
  icon?: 'ueIcon' | 'cppLogo';
}

/** Default links shown in the Links tab. Customize as needed. */
export const LINKS: LinkEntry[] = [
  { url: 'https://docs.unrealengine.com', label: 'Unreal Engine Docs', icon: 'ueIcon' },
  { url: 'https://github.com/EpicGames/UnrealEngine', label: 'Unreal Engine (GitHub)', icon: 'ueIcon' },
  { url: 'https://forums.unrealengine.com', label: 'Unreal Forums', icon: 'ueIcon' },
  { url: 'https://dev.epicgames.com/documentation', label: 'Epic Dev Docs', icon: 'ueIcon' },
  { url: 'https://github.com', label: 'GitHub', icon: 'cppLogo' },
  { url: 'https://learn.microsoft.com/en-us/cpp', label: 'C++ Docs (MS)', icon: 'cppLogo' },
];
