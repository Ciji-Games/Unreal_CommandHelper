/**
 * Job blocking - which process groups must be clear for a job to run.
 * Steps like "launch" don't require any processes to be closed.
 * Steps like "regenerate" require Unreal, VS, Rider to be closed.
 */

import type { ScheduledJob } from '../types';

/** Process groups checked by the backend (umap, uproject, regenerate) */
export type ProcessGroupName = 'umap' | 'uproject' | 'regenerate';

/**
 * Which process group(s) each step type requires to be clear.
 * - umap: UnrealEditor (HLOD, MiniMap, lighting, plugin build)
 * - uproject: UnrealEditor (Cook, Package, Build, Archive)
 * - regenerate: UnrealEditor, VS, Rider (regenerate project)
 * - launch: none - can run with Unreal/IDE open
 */
const STEP_PROCESS_GROUPS: Record<string, ProcessGroupName[]> = {
  delete_hlod: ['umap'],
  build_hlod: ['umap'],
  build_minimap: ['umap'],
  build_lighting: ['umap'],
  cook: ['uproject'],
  package: ['uproject'],
  archive: ['uproject'],
  build: ['uproject'],
  regenerate: ['regenerate'],
  build_plugin: ['umap'],
  launch: [],
  movie_render_queue: ['uproject'],
};

/**
 * Returns the process groups that must be clear for this job to run.
 * Empty array means the job has no blocking requirements (e.g. launch-only).
 */
export function getBlockingGroupsForJob(job: ScheduledJob): ProcessGroupName[] {
  const groups = new Set<ProcessGroupName>();
  for (const step of job.steps) {
    const stepGroups = STEP_PROCESS_GROUPS[step.id] ?? [];
    for (const g of stepGroups) {
      groups.add(g);
    }
  }
  return Array.from(groups);
}

/**
 * Returns a short message when the job is blocked, or null when not blocked.
 */
export function getBlockingMessageForJob(
  job: ScheduledJob,
  monitors: {
    umap: { hasBlockingProcesses: boolean };
    uproject: { hasBlockingProcesses: boolean };
    regenerate: { hasBlockingProcesses: boolean };
  }
): string | null {
  const groups = getBlockingGroupsForJob(job);
  if (groups.length === 0) return null;

  const regenerateBlocked = monitors.regenerate.hasBlockingProcesses;
  const umapBlocked = monitors.umap.hasBlockingProcesses;
  const uprojectBlocked = monitors.uproject.hasBlockingProcesses;

  if (groups.includes('regenerate') && regenerateBlocked) {
    return 'Blocked: U.E or IDE running';
  }
  if ((groups.includes('umap') && umapBlocked) || (groups.includes('uproject') && uprojectBlocked)) {
    return 'Blocked: U.E is running';
  }
  return null;
}

/**
 * Returns true if the job has blocking processes for any of its required groups.
 */
export function hasBlockingProcessesForJob(
  job: ScheduledJob,
  monitors: {
    umap: { hasBlockingProcesses: boolean };
    uproject: { hasBlockingProcesses: boolean };
    regenerate: { hasBlockingProcesses: boolean };
  }
): boolean {
  const groups = getBlockingGroupsForJob(job);
  if (groups.length === 0) return false;

  return groups.some((g) => monitors[g].hasBlockingProcesses);
}
