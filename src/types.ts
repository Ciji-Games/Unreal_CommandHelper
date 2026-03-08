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
