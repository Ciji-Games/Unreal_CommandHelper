/**
 * Project display utilities.
 */

import type { ProjectInfo } from '../types';

/**
 * Returns the short engine version (e.g. "5.7") from a full version string.
 * - "5.7.1" → "5.7"
 * - "5.7" → "5.7"
 * - GUID or unknown format → returns as-is
 */
export function getShortEngineVersion(engineVersion: string): string {
  if (!engineVersion) return '';
  // Match semantic version pattern (e.g. 5.7, 5.7.1)
  const match = engineVersion.match(/^(\d+\.\d+)/);
  return match ? match[1] : engineVersion;
}

/**
 * Returns the project display label for dropdowns: "Project Name (5.7)"
 */
export function getProjectDisplayLabel(project: ProjectInfo): string {
  const short = getShortEngineVersion(project.engineVersion);
  return short ? `${project.projectName} (${short})` : project.projectName;
}
