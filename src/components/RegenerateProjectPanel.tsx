/**
 * Regenerate project panel - nuke solution, delete cache/build, run UnrealVersionSelector.
 * Step 8: Mirrors RegenerateProject.cs
 */

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../hooks/useProjects';
import { useSettings } from '../hooks/useSettings';
import { useLog } from '../contexts/LogContext';

export function RegenerateProjectPanel() {
  const { projects, addProject } = useProjects();
  const { settings } = useSettings();
  const { clearLog } = useLog();
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
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold text-white mb-1">Regenerate Project</h3>
        <p className="text-zinc-400 text-sm">
          Nuke solution, delete cache/build, then regenerate project files via UnrealVersionSelector. Only for C++ projects.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-sm text-zinc-300 mb-1">Project (C++ only)</label>
          <select
            value={selectedPath}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          >
            <option value="">
              {cppProjects.length === 0
                ? 'No C++ projects available'
                : 'Select a project'}
            </option>
            {cppProjects.map((p) => (
              <option key={p.projectPath} value={p.projectPath}>
                {p.projectName}
              </option>
            ))}
            <option value="__browse__">Browse new project...</option>
          </select>
          {cppProjects.length === 0 && (
            <p className="mt-1 text-sm text-amber-400/90">
              Add a C++ project (with a Source folder) to use Regenerate.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-zinc-300 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={buildAfter}
              onChange={(e) => setBuildAfter(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
            />
            Build Project
          </label>
          <label className="flex items-center gap-2 text-zinc-300 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={openProjectAfter}
              onChange={(e) => setOpenProjectAfter(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
            />
            Launch Project
          </label>
          <label className="flex items-center gap-2 text-zinc-300 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={openSlnAfter}
              onChange={(e) => setOpenSlnAfter(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
            />
            Open .sln
          </label>
        </div>

        <button
          type="button"
          onClick={handleRegenerate}
          disabled={!selectedPath || selectedPath === '__browse__' || running || cppProjects.length === 0}
          className="rounded px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
        >
          {running ? 'Regenerating...' : 'Regenerate'}
        </button>
      </div>
    </div>
  );
}
