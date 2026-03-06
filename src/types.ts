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
