/**
 * Shared types for UE Launcher
 */

export interface ProjectInfo {
  projectPath: string;
  projectName: string;
  engineVersion: string;
  engineInstallPath: string;
  isCpp: boolean;
  maps: string[];
}

export interface EngineEntry {
  version: string;
  editorPath: string;
}

/** Process monitoring - status for a single monitored application */
export interface ProcessStatus {
  id: string;
  displayName: string;
  isRunning: boolean;
  pids: number[];
}

/** Scheduler - step in a batch job */
export interface ScheduledStep {
  id: string; // Step type ID
  params: Record<string, unknown>; // Step-specific params, matching existing tool panel fields
}

/** Scheduler - named batch job */
export interface ScheduledJob {
  id: string; // UUID
  name: string;
  steps: ScheduledStep[];
  /** When true, job appears in the Launcher under Pinned Jobs */
  pinned?: boolean;
}

/** Schedulable step type */
export interface SchedulableStepDef {
  id: string;
  label: string;
  requiresMap: boolean;
}

/** Batch commit scan result */
export interface BatchCommitScanResult {
  gitRoot: string;
  smallFiles: { path: string; size: number }[];
  groupedCommits: { path: string; size: number }[][];
  largeFiles: { path: string; size: number }[];
}

/** Catalog of schedulable steps */
export const SCHEDULABLE_STEPS: SchedulableStepDef[] = [
  { id: 'delete_hlod', label: 'Delete HLOD', requiresMap: true },
  { id: 'build_hlod', label: 'Build HLOD', requiresMap: true },
  { id: 'build_minimap', label: 'Build MiniMap', requiresMap: true },
  { id: 'build_lighting', label: 'Build Static Lighting', requiresMap: true },
  { id: 'resave_packages', label: 'Resave Packages', requiresMap: false },
  { id: 'resave_actors', label: 'Resave Actors', requiresMap: true },
  { id: 'foliage_builder', label: 'Foliage Builder', requiresMap: true },
  { id: 'navigation_data', label: 'Navigation Data Builder', requiresMap: true },
  { id: 'rename_duplicate', label: 'Rename/Duplicate Map', requiresMap: true },
  { id: 'cook', label: 'Cook', requiresMap: false },
  { id: 'package', label: 'Package', requiresMap: false },
  { id: 'archive', label: 'Archive Project', requiresMap: false },
  { id: 'build', label: 'Build', requiresMap: false },
  { id: 'regenerate', label: 'Regenerate Project', requiresMap: false },
  { id: 'build_plugin', label: 'Build Plugin', requiresMap: false },
  { id: 'launch', label: 'Launch Project', requiresMap: false },
  { id: 'movie_render_queue', label: 'Movie Render Queue', requiresMap: true },
];
