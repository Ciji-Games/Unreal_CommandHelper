/**
 * Launcher tab - Engine Versions section + Projects section + Add Project button.
 * Mirrors TabLauncher layout from Form1 (projectList1, projectList2).
 */

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useProjects } from '../hooks/useProjects';
import { useScheduledJobs } from '../hooks/useScheduledJobs';
import { useRunScheduledJob } from '../hooks/useRunScheduledJob';
import { useProcessMonitor } from '../hooks/useProcessMonitor';
import { hasBlockingProcessesForJob } from '../utils/jobBlocking';
import { LauncherCard } from './LauncherCard';
import { AddProjectButton } from './AddProjectButton';
import { PinnedJobCard } from './PinnedJobCard';
import type { ProjectInfo, EngineEntry } from '../types';

export function LauncherTab() {
  const { projects, addProject, removeProject, refresh, loading: projectsLoading } = useProjects();
  const { jobs } = useScheduledJobs();
  const { runJob, running: runJobRunning } = useRunScheduledJob();
  const umapMonitor = useProcessMonitor('umap');
  const uprojectMonitor = useProcessMonitor('uproject');
  const regenerateMonitor = useProcessMonitor('regenerate');
  const monitors = {
    umap: umapMonitor,
    uproject: uprojectMonitor,
    regenerate: regenerateMonitor,
  };
  const [engines, setEngines] = useState<EngineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const pinnedJobs = jobs.filter((j) => j.pinned);

  useEffect(() => {
    invoke<EngineEntry[]>('get_installed_engine_paths')
      .then(setEngines)
      .catch(() => setEngines([]))
      .finally(() => setLoading(false));
  }, []);

  const handleAddProject = async (uprojectPath: string) => {
    try {
      const project = await invoke<ProjectInfo>('analyse_uproject', { path: uprojectPath });
      await addProject(project);
    } catch (e) {
      console.error('Failed to add project:', e);
    }
  };

  const handleRemoveProject = async (projectPath: string) => {
    await removeProject(projectPath);
  };

  const engineAsProjectInfo = (e: EngineEntry): ProjectInfo => ({
    projectPath: e.editorPath,
    projectName: `UE ${e.version}`,
    engineVersion: e.version,
    engineInstallPath: e.editorPath,
    isCpp: false,
    maps: [],
  });

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold text-white">UE Launcher</h1>
      <p className="text-zinc-400 text-sm">
        Unreal Engine project launcher and toolbox
      </p>

      {/* Engine Versions */}
      <section>
        <h2 className="text-lg font-semibold text-amber-500 mb-2">Engine Versions</h2>
        {loading ? (
          <p className="text-zinc-500 text-sm">Loading engines...</p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {engines.map((e) => (
              <LauncherCard
                key={e.version}
                project={engineAsProjectInfo(e)}
                isEngine
              />
            ))}
            {engines.length === 0 && (
              <p className="text-zinc-500 text-sm">No engines found.</p>
            )}
          </div>
        )}
      </section>

      {/* Projects */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg font-semibold text-amber-500">Projects</h2>
          <button
            type="button"
            onClick={refresh}
            disabled={projectsLoading}
            className="rounded px-2 py-1 text-xs font-medium bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Re-scan projects (remove deleted, refresh maps)"
          >
            {projectsLoading ? 'Scanning…' : 'Re-scan'}
          </button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {projects.map((p) => (
            <LauncherCard
              key={p.projectPath}
              project={p}
              onRemove={handleRemoveProject}
            />
          ))}
          <AddProjectButton onAdd={handleAddProject} />
        </div>
      </section>

      {/* Pinned Jobs - only shown when there are pinned jobs */}
      {pinnedJobs.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-amber-500 mb-2">Pinned Jobs</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {pinnedJobs.map((job) => (
              <PinnedJobCard
                key={job.id}
                job={job}
                onRun={(j) => runJob(j, { stopOnFailure: true })}
                disabled={
                  runJobRunning ||
                  job.steps.length === 0 ||
                  hasBlockingProcessesForJob(job, monitors)
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
