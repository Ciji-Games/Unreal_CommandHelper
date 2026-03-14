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
import { hasBlockingProcessesForJob, getBlockingMessageForJob } from '../utils/jobBlocking';
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
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-100 tracking-tight">UE Launcher</h1>
        <p className="text-slate-400 text-sm">
          Unreal Engine project launcher and toolbox
        </p>
      </header>

      {/* Engine Versions */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-300 uppercase tracking-wider">Engine Versions</h2>
        {loading ? (
          <p className="text-slate-500 text-sm">Loading engines...</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {engines.map((e) => (
              <LauncherCard
                key={e.version}
                project={engineAsProjectInfo(e)}
                isEngine
              />
            ))}
            {engines.length === 0 && (
              <p className="text-slate-500 text-sm">No engines found.</p>
            )}
          </div>
        )}
      </section>

      {/* Projects */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-slate-300 uppercase tracking-wider">Projects</h2>
          <button
            type="button"
            onClick={refresh}
            disabled={projectsLoading}
            className="rounded-md px-2.5 py-1 text-xs font-medium bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-slate-600/50"
            title="Re-scan projects (remove deleted, refresh maps)"
          >
            {projectsLoading ? 'Scanning…' : 'Re-scan'}
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
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
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-slate-300 uppercase tracking-wider">Pinned Jobs</h2>
          <div className="flex flex-wrap gap-3">
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
                blockingMessage={getBlockingMessageForJob(job, monitors)}
                running={runJobRunning}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
