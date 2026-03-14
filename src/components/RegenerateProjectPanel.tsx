/**
 * Regenerate project panel - nuke solution, delete cache/build, run UnrealVersionSelector.
 * Step 8: Mirrors RegenerateProject.cs. Step 10: Wrapped in ToolGroup.
 */

import { useEffect, useState } from 'react';
import { ToolGroup } from './ToolGroup';
import { Select } from './Select';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../hooks/useProjects';
import { getProjectDisplayLabel } from '../utils/project';
import { useSettings } from '../hooks/useSettings';
import { useLog } from '../contexts/LogContext';
import { useProgress } from '../contexts/ProgressContext';
import { useProcessMonitor } from '../hooks/useProcessMonitor';

const REGENERATE_PROCESS_GROUP = 'regenerate';

export function RegenerateProjectPanel() {
  const { projects, addProject } = useProjects();
  const { settings } = useSettings();
  const { clearLog } = useLog();
  const { startProgress, finishProgress } = useProgress();
  const { runningProcesses: blockingProcesses, hasBlockingProcesses } =
    useProcessMonitor(REGENERATE_PROCESS_GROUP);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [versionSelectorPath, setVersionSelectorPath] = useState<string | null>(null);
  const [buildAfter, setBuildAfter] = useState(false);
  const [openProjectAfter, setOpenProjectAfter] = useState(false);
  const [openSlnAfter, setOpenSlnAfter] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const loadPath = async () => {
      const fromSettings = settings.unrealVersionSelectorPath;
      if (fromSettings) {
        setVersionSelectorPath(fromSettings);
        return;
      }
      try {
        const p = await invoke<string | null>('get_unreal_version_selector_path');
        setVersionSelectorPath(p ?? null);
      } catch {
        setVersionSelectorPath(null);
      }
    };
    loadPath();
  }, [settings.unrealVersionSelectorPath]);

  const cppProjects = projects.filter((p) => p.isCpp);

  const handleProjectChange = async (value: string) => {
    if (value === '__browse__') {
      setSelectedPath('__browse__');
      const path = await open({
        directory: false,
        filters: [{ name: 'Unreal Project', extensions: ['uproject'] }],
      });
      if (path && typeof path === 'string') {
        try {
          const project = await invoke<import('../types').ProjectInfo>('analyse_uproject', {
            path,
          });
          if (!project.isCpp) {
            alert('This project has no C++ code (no Source folder). Regenerate is only for C++ projects.');
            setSelectedPath('');
            return;
          }
          await addProject(project);
          setSelectedPath(project.projectPath);
        } catch (e) {
          console.error('Failed to analyse project:', e);
          setSelectedPath('');
        }
      } else {
        setSelectedPath('');
      }
    } else {
      setSelectedPath(value);
    }
  };

  const handleRegenerate = async () => {
    if (!selectedPath) return;
    const versionPath = settings.unrealVersionSelectorPath || versionSelectorPath;
    if (!versionPath) {
      alert('UnrealVersionSelector.exe not found. Please set the path in settings.');
      return;
    }
    const selectedProject = projects.find((p) => p.projectPath === selectedPath);
    const enginePath = selectedProject?.engineInstallPath ?? '';

    clearLog();
    setRunning(true);
    startProgress();
    try {
      await invoke('regenerate_project', {
        uprojectPath: selectedPath,
        openProjectAfter,
        openSlnAfter,
        buildAfter,
        versionSelectorPath: versionPath,
        engineInstallPath: enginePath,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Regenerate failed:', e);
      alert(`Regenerate failed: ${msg}`);
    } finally {
      setRunning(false);
      finishProgress();
    }
  };

  return (
    <ToolGroup
      title="Regenerate Project"
      description="Nuke solution, delete cache/build, then regenerate project files via UnrealVersionSelector. Only for C++ projects."
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-sm text-slate-300 mb-1">Project (C++ only)</label>
          <Select
            value={selectedPath}
            onChange={(v) => handleProjectChange(v)}
            placeholder={cppProjects.length === 0 ? 'No C++ projects available' : 'Select a project'}
            options={[
              ...cppProjects.map((p) => ({ value: p.projectPath, label: getProjectDisplayLabel(p) })),
              { value: '__browse__', label: 'Browse new project...' },
            ]}
          />
          {cppProjects.length === 0 && (
            <p className="mt-1 text-sm text-sky-400/90">
              Add a C++ project (with a Source folder) to use Regenerate.
            </p>
          )}
        </div>

        {hasBlockingProcesses && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
            <p className="font-medium">Cannot regenerate: The following programs are running</p>
            <p className="mt-1 text-amber-100/80">
              {blockingProcesses.map((p) => p.displayName).join(', ')} — close them before
              regenerating.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={buildAfter}
              onChange={(e) => setBuildAfter(e.target.checked)}
              className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
            />
            Build Project
          </label>
          <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={openProjectAfter}
              onChange={(e) => setOpenProjectAfter(e.target.checked)}
              className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
            />
            Launch Project
          </label>
          <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={openSlnAfter}
              onChange={(e) => setOpenSlnAfter(e.target.checked)}
              className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
            />
            Open .sln
          </label>
        </div>

        <button
          type="button"
          onClick={handleRegenerate}
          disabled={
            !selectedPath ||
            selectedPath === '__browse__' ||
            running ||
            cppProjects.length === 0 ||
            hasBlockingProcesses
          }
          className="rounded-md px-4 py-2 bg-sky-600/80 hover:bg-sky-500/80 disabled:bg-slate-600 disabled:text-slate-500 text-white font-medium transition-colors"
        >
          {running ? 'Regenerating...' : 'Regenerate'}
        </button>
      </div>
    </ToolGroup>
  );
}
