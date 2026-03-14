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

/** Link entry for the Links tab. icon is optional asset key or undefined for default. */
export interface LinkEntry {
  url: string;
  label: string;
  icon?: 'ueIcon' | 'cppLogo' | 'fab' | 'logoBackend' | 'logoAcademy' | 'discord';
}

/** Category with its links. */
export interface LinkCategory {
  name: string;
  links: LinkEntry[];
}

/** Links shown in the Links tab, grouped by category. From links.md. */
export const LINK_CATEGORIES: LinkCategory[] = [
  {
    name: 'Official links',
    links: [
      { url: 'https://forums.unrealengine.com/categories?tag=unreal-engine', label: 'Forums Unreal Engine', icon: 'ueIcon' },
      { url: 'https://docs.unrealengine.com/', label: 'Latest documentation', icon: 'ueIcon' },
      { url: 'https://www.fab.com/', label: 'Fab.com', icon: 'fab' },
    ],
  },
  {
    name: 'Community links',
    links: [
      { url: 'https://unreal-garden.com/', label: 'Unreal Garden', icon: 'ueIcon' },
      { url: 'https://www.unrealdirective.com/resources/asset-naming-conventions', label: 'Assets Naming convention', icon: 'ueIcon' },
      { url: 'https://discord.gg/unrealsource', label: 'Unreal Source', icon: 'discord' },
    ],
  },
  {
    name: 'Ciji Games',
    links: [
      { url: 'https://ciji.dev/', label: 'Gamedev backend', icon: 'logoBackend' },
      { url: 'https://academy.cijigames.com/', label: 'French U.E Courses', icon: 'logoAcademy' },
      { url: 'https://www.fab.com/sellers/Ciji%20Games', label: 'Ciji Games on FAB', icon: 'fab' },
    ],
  },
];
