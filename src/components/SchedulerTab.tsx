/**
 * Scheduler tab - create, edit, and run named batch jobs (sequences of tools).
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useProjects } from '../hooks/useProjects';
import { useSettings } from '../hooks/useSettings';
import { useScheduledJobs } from '../hooks/useScheduledJobs';
import { useProcessMonitor } from '../hooks/useProcessMonitor';
import { useLog } from '../contexts/LogContext';
import { useProgress } from '../contexts/ProgressContext';
import { ToolGroup } from './ToolGroup';
import { OutputLogPanel } from './OutputLogPanel';
import {
  StepParamPanelMap,
  StepParamPanelLighting,
  StepParamPanelUProject,
  StepParamPanelArchive,
  StepParamPanelRegenerate,
  StepParamPanelPlugin,
  StepParamPanelLaunch,
} from './scheduler';
import type { ScheduledJob, ScheduledStep } from '../types';
import { SCHEDULABLE_STEPS } from '../types';

const MAP_STEP_IDS = ['delete_hlod', 'build_hlod', 'build_minimap'];

function getStepLabel(stepId: string): string {
  return SCHEDULABLE_STEPS.find((s) => s.id === stepId)?.label ?? stepId;
}

function StepParamPanel({
  step,
  value,
  onChange,
}: {
  step: ScheduledStep;
  value: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}) {
  if (MAP_STEP_IDS.includes(step.id)) {
    return <StepParamPanelMap value={value} onChange={onChange} />;
  }
  if (step.id === 'build_lighting') {
    return <StepParamPanelLighting value={value} onChange={onChange} />;
  }
  if (step.id === 'cook') {
    return (
      <StepParamPanelUProject stepId="cook" value={value} onChange={onChange} />
    );
  }
  if (step.id === 'package') {
    return (
      <StepParamPanelUProject stepId="package" value={value} onChange={onChange} />
    );
  }
  if (step.id === 'build') {
    return (
      <StepParamPanelUProject stepId="build" value={value} onChange={onChange} />
    );
  }
  if (step.id === 'archive') {
    return <StepParamPanelArchive value={value} onChange={onChange} />;
  }
  if (step.id === 'regenerate') {
    return <StepParamPanelRegenerate value={value} onChange={onChange} />;
  }
  if (step.id === 'build_plugin') {
    return <StepParamPanelPlugin value={value} onChange={onChange} />;
  }
  if (step.id === 'launch') {
    return <StepParamPanelLaunch value={value} onChange={onChange} />;
  }
  return null;
}

export function SchedulerTab() {
  const { jobs, loading, addJob, updateJob, removeJob } = useScheduledJobs();
  const { projects } = useProjects();
  const { settings } = useSettings();
  const { clearLog } = useLog();
  const { startProgressForScheduler, setCurrentStep, finishProgress, stopRequestedRef } = useProgress();
  const umapMonitor = useProcessMonitor('umap');
  const uprojectMonitor = useProcessMonitor('uproject');
  const regenerateMonitor = useProcessMonitor('regenerate');

  const hasBlockingProcesses =
    umapMonitor.hasBlockingProcesses ||
    uprojectMonitor.hasBlockingProcesses ||
    regenerateMonitor.hasBlockingProcesses;

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  const [runDialogJob, setRunDialogJob] = useState<ScheduledJob | null>(null);
  const [stopOnFailure, setStopOnFailure] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([0]));
  const [showOutputLog, setShowOutputLog] = useState(false);

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  useEffect(() => {
    if (editingJob) {
      setExpandedSteps(
        editingJob.steps.length > 0 ? new Set([0]) : new Set()
      );
    }
  }, [editingJob?.id]);

  const handleCreate = async () => {
    const newJob = await addJob({ name: 'New Job', steps: [] });
    setSelectedJobId(newJob.id);
    setEditingJob({ ...newJob });
  };

  const handleEdit = (job: ScheduledJob) => {
    setSelectedJobId(job.id);
    setEditingJob({ ...job });
  };

  const handleEditName = (name: string) => {
    if (!editingJob) return;
    setEditingJob({ ...editingJob, name });
  };

  const handleSave = async () => {
    if (!editingJob) return;
    await updateJob(editingJob.id, editingJob);
    setEditingJob(null);
  };

  const handleCancelEdit = () => {
    setEditingJob(null);
  };

  const handleAddStep = (stepId: string) => {
    if (!editingJob) return;
    const newStep: ScheduledStep = { id: stepId, params: {} };
    const newIndex = editingJob.steps.length;
    setEditingJob({
      ...editingJob,
      steps: [...editingJob.steps, newStep],
    });
    setExpandedSteps((prev) => new Set([...prev, newIndex]));
  };

  const toggleStepExpanded = (index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleRemoveStep = (index: number) => {
    if (!editingJob) return;
    setEditingJob({
      ...editingJob,
      steps: editingJob.steps.filter((_, i) => i !== index),
    });
    setExpandedSteps((prev) =>
      new Set(
        [...prev]
          .filter((i) => i !== index)
          .map((i) => (i > index ? i - 1 : i))
      )
    );
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    if (!editingJob) return;
    const newSteps = [...editingJob.steps];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= newSteps.length) return;
    [newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]];
    setEditingJob({ ...editingJob, steps: newSteps });
    setExpandedSteps((prev) =>
      new Set(
        [...prev].map((i) => {
          if (i === index) return target;
          if (i === target) return index;
          return i;
        })
      )
    );
  };

  const handleStepParamsChange = (index: number, params: Record<string, unknown>) => {
    if (!editingJob) return;
    const newSteps = [...editingJob.steps];
    newSteps[index] = { ...newSteps[index], params };
    setEditingJob({ ...editingJob, steps: newSteps });
  };

  const handleRun = (job: ScheduledJob) => {
    setRunDialogJob(job);
    setStopOnFailure(true);
  };

  const handleCancelRun = () => {
    setRunDialogJob(null);
  };

  const handleConfirmRun = async () => {
    const job = runDialogJob;
    if (!job || job.steps.length === 0 || running || hasBlockingProcesses) return;

    const shouldStopOnFailure = stopOnFailure;
    setRunDialogJob(null);
    setShowOutputLog(true);

    setRunning(true);
    clearLog();
    startProgressForScheduler(
      job.steps.length,
      job.steps.map((s) => getStepLabel(s.id))
    );

    let failed = false;
    for (let i = 0; i < job.steps.length && !failed; i++) {
      if (stopRequestedRef.current) break;
      setCurrentStep(i);
      const step = job.steps[i];
      const params = step.params;
      const projectPath = params.project as string;
      const project = projects.find((p) => p.projectPath === projectPath);
      const enginePath = project?.engineInstallPath ?? '';

      try {
        if (step.id === 'delete_hlod') {
          await invoke('run_map_command', {
            projectPath,
            mapPath: params.map,
            builder: 'WorldPartitionHLODsBuilder',
            extraArgs: '-DeleteHLODs',
            enginePath,
            launchMapAfter: params.launchMapAfter ?? false,
          });
        } else if (step.id === 'build_hlod') {
          await invoke('run_map_command', {
            projectPath,
            mapPath: params.map,
            builder: 'WorldPartitionHLODsBuilder',
            extraArgs: null,
            enginePath,
            launchMapAfter: params.launchMapAfter ?? false,
          });
        } else if (step.id === 'build_minimap') {
          await invoke('run_map_command', {
            projectPath,
            mapPath: params.map,
            builder: 'WorldPartitionMiniMapBuilder',
            extraArgs: null,
            enginePath,
            launchMapAfter: params.launchMapAfter ?? false,
          });
        } else if (step.id === 'build_lighting') {
          await invoke('run_build_lighting', {
            projectPath,
            mapPath: params.map,
            enginePath,
            quality: params.quality ?? undefined,
          });
        } else if (step.id === 'cook') {
          await invoke('run_cook', {
            projectPath,
            platform: params.platform ?? 'Win64',
            enginePath,
          });
        } else if (step.id === 'package') {
          const pkgPath =
            (params.outputPath as string) ?? (params.archiveDirectory as string) ?? '';
          const pkgDir = pkgPath.toLowerCase().endsWith('.zip')
            ? pkgPath.slice(0, Math.max(pkgPath.lastIndexOf('/'), pkgPath.lastIndexOf('\\')))
            : pkgPath;
          await invoke('run_package', {
            projectPath,
            platform: params.platform ?? 'Win64',
            clientConfig: params.config ?? 'Development',
            archiveDirectory: pkgDir,
            enginePath,
          });
        } else if (step.id === 'archive') {
          const outPath =
            (params.outputPath as string) ?? (params.outputZipPath as string) ?? '';
          const projectName =
            projectPath.split(/[/\\]/).pop()?.replace(/\.uproject$/, '') ?? 'Project';
          const zipPath = outPath.toLowerCase().endsWith('.zip')
            ? outPath
            : `${outPath.replace(/[/\\]+$/, '')}/${projectName}.zip`;
          await invoke('run_archive', {
            projectPath,
            outputZipPath: zipPath,
            enginePath,
          });
        } else if (step.id === 'build') {
          await invoke('run_build', {
            projectPath,
            enginePath,
            isCpp: project?.isCpp ?? false,
          });
        } else if (step.id === 'regenerate') {
          const versionPath =
            settings.unrealVersionSelectorPath ||
            (await invoke<string | null>('get_unreal_version_selector_path'));
          if (!versionPath) throw new Error('UnrealVersionSelector.exe not found. Set path in settings.');
          await invoke('regenerate_project', {
            uprojectPath: projectPath,
            openProjectAfter: params.openProjectAfter ?? false,
            openSlnAfter: params.openSlnAfter ?? false,
            buildAfter: params.buildAfter ?? false,
            versionSelectorPath: versionPath,
            engineInstallPath: enginePath,
          });
        } else if (step.id === 'build_plugin') {
          await invoke('build_plugin', {
            upluginPath: params.upluginPath ?? '',
            engineVersion: params.engineVersion ?? '',
            createZip: params.createZip ?? true,
          });
        } else if (step.id === 'launch') {
          const mapPath = params.map as string | undefined;
          if (mapPath && enginePath && enginePath !== 'Unknown') {
            await invoke('launch_project_with_map', {
              projectPath,
              mapPath,
              enginePath,
            });
          } else {
            await invoke('open_file', { path: projectPath });
          }
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`Step ${i + 1} (${getStepLabel(step.id)}) failed:`, errMsg);
        if (stopRequestedRef.current || shouldStopOnFailure) {
          failed = true;
        }
      }
    }

    setRunning(false);
    finishProgress();
  };

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold text-white">Scheduler</h1>
        <p className="text-zinc-400 text-sm">
          Create named batch jobs as sequences of tools. Run jobs to execute steps in order.
        </p>
        {hasBlockingProcesses && (
          <div className="mt-2 rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <p className="font-medium">Cannot run: Unreal Engine or related tools are running</p>
            <p className="mt-1 text-amber-200/90">
              Close Unreal Editor, Visual Studio, or Rider before running jobs.
            </p>
          </div>
        )}
      </div>

      <div
        className={`flex gap-4 min-h-0 overflow-hidden ${
          showOutputLog ? 'flex-[4_1_0]' : 'flex-[6_1_0]'
        }`}
      >
        {/* Left: Job list */}
        <div className="w-64 shrink-0 flex flex-col">
          <nav className="flex flex-col gap-1 rounded-lg overflow-hidden bg-zinc-900/80 border border-zinc-800">
            <div className="px-4 py-2 rounded-t bg-zinc-800/50 border-b border-zinc-700">
              <h3 className="font-semibold text-white text-sm">Jobs</h3>
            </div>
            {loading ? (
              <p className="px-4 py-3 text-zinc-400 text-sm">Loading...</p>
            ) : jobs.length === 0 ? (
              <p className="px-4 py-3 text-zinc-400 text-sm">No jobs yet</p>
            ) : (
              jobs.map((job) => (
                <div
                  key={job.id}
                  className={`flex items-center justify-between gap-2 px-4 py-2 border-b border-zinc-800 last:border-b-0 ${
                    selectedJobId === job.id
                      ? 'bg-amber-600/20 text-amber-100'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedJobId(job.id)}
                    className="flex-1 text-left min-w-0 truncate"
                  >
                    {job.name}
                  </button>
                  <span className="text-xs text-zinc-500 shrink-0">
                    {job.steps.length} steps
                  </span>
                </div>
              ))
            )}
            <div className="p-2 border-t border-zinc-700">
              <button
                type="button"
                onClick={handleCreate}
                className="w-full rounded px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors"
              >
                Create Job
              </button>
            </div>
          </nav>
        </div>

        {/* Right: Job editor */}
        <div className="flex-1 min-w-0 min-h-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 overflow-y-auto">
          {editingJob ? (
            <ToolGroup
              title="Edit Job"
              description="Configure job name and steps. Add steps from the catalog and set their parameters."
            >
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm text-zinc-300 mb-1">Job name</label>
                  <input
                    type="text"
                    value={editingJob.name}
                    onChange={(e) => handleEditName(e.target.value)}
                    className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                    placeholder="e.g. HLOD Pipeline"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-300 mb-2">Add step</label>
                  <div className="flex flex-wrap gap-2">
                    {SCHEDULABLE_STEPS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleAddStep(s.id)}
                        className="rounded px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-sm"
                      >
                        + {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-zinc-300 mb-2">Steps</label>
                  {editingJob.steps.length === 0 ? (
                    <p className="text-zinc-500 text-sm">No steps. Add steps above.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {editingJob.steps.map((step, index) => {
                        const isExpanded = expandedSteps.has(index);
                        return (
                          <div
                            key={`${step.id}-${index}`}
                            className="rounded-lg border border-zinc-700 bg-zinc-800/50 overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => toggleStepExpanded(index)}
                              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/80 transition-colors"
                            >
                              <span className="font-medium text-white">
                                {index + 1}. {getStepLabel(step.id)}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveStep(index, 'up');
                                  }}
                                  disabled={index === 0}
                                  className="rounded px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white text-xs"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveStep(index, 'down');
                                  }}
                                  disabled={index === editingJob!.steps.length - 1}
                                  className="rounded px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white text-xs"
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveStep(index);
                                  }}
                                  className="rounded px-2 py-1 bg-zinc-700 hover:bg-red-600/80 text-white text-xs"
                                >
                                  Remove
                                </button>
                                <span
                                  className={`inline-block text-zinc-400 text-xs transition-transform ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ▼
                                </span>
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="px-4 pb-4 pt-0 border-t border-zinc-700">
                                <StepParamPanel
                                  step={step}
                                  value={step.params}
                                  onChange={(p) => handleStepParamsChange(index, p)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="rounded px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="rounded px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </ToolGroup>
          ) : selectedJob ? (
            <div className="text-zinc-400">
              <p className="mb-2 text-white font-medium">{selectedJob.name}</p>
              <p className="text-sm mb-4">
                {selectedJob.steps.length} steps:{' '}
                {selectedJob.steps.map((s) => getStepLabel(s.id)).join(' → ')}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleEdit(selectedJob)}
                  className="rounded px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-sm"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleRun(selectedJob)}
                  disabled={selectedJob.steps.length === 0 || hasBlockingProcesses}
                  className="rounded px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm"
                >
                  Run
                </button>
                <button
                  type="button"
                  onClick={() => removeJob(selectedJob.id).then(() => setSelectedJobId(null))}
                  className="rounded px-3 py-1.5 bg-zinc-700 hover:bg-red-600/80 text-white text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <p className="text-zinc-500">Select or create a job to get started.</p>
          )}
        </div>
      </div>

      {/* Output Log - hidden by default, shown when job runs or user toggles */}
      <div
        className={`flex flex-col min-w-0 transition-all ${
          showOutputLog ? 'flex-[6_1_0] min-h-0' : 'shrink-0'
        }`}
      >
        <button
          type="button"
          onClick={() => setShowOutputLog((prev) => !prev)}
          className="flex items-center justify-between w-full px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-left"
        >
          <span className="text-sm font-medium text-zinc-300">
            Output Log
          </span>
          <span
            className={`inline-block text-zinc-400 text-xs transition-transform ${
              showOutputLog ? 'rotate-180' : ''
            }`}
          >
            ▼
          </span>
        </button>
        {showOutputLog && (
          <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden mt-2">
            <OutputLogPanel />
          </div>
        )}
      </div>

      {/* Run dialog */}
      {runDialogJob && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="rounded-lg bg-zinc-900 border border-zinc-700 p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">
              Run: {runDialogJob.name}
            </h3>
            <p className="text-zinc-400 text-sm mb-4">
              {runDialogJob.steps.length} steps will run in sequence.
            </p>
            <label className="flex items-center gap-2 text-zinc-300 text-sm cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={stopOnFailure}
                onChange={(e) => setStopOnFailure(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
              />
              Stop on first failure
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleConfirmRun()}
                disabled={running || hasBlockingProcesses}
                className="rounded px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium"
              >
                {running ? 'Running...' : 'Run'}
              </button>
              <button
                type="button"
                onClick={handleCancelRun}
                disabled={running}
                className="rounded px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
