/**
 * UMap Helper panel - HLOD, MiniMap, static lighting, Delete HLOD commandlets.
 * Step 11: Mirrors UmapHelper.cs
 */

const LIGHTING_QUALITIES = ['Preview', 'Medium', 'High', 'Production', 'MAX'] as const;

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../hooks/useProjects';
import { useLog } from '../contexts/LogContext';
import { useProgress } from '../contexts/ProgressContext';
import { useProcessMonitor } from '../hooks/useProcessMonitor';
import { ToolGroup } from './ToolGroup';
import type { ProjectInfo } from '../types';

const UMAP_PROCESS_GROUP = 'umap';

export function UmapHelperPanel() {
  const { projects, addProject } = useProjects();
  const { clearLog } = useLog();
  const { startProgress, finishProgress } = useProgress();
  const { runningProcesses: blockingProcesses, hasBlockingProcesses } =
    useProcessMonitor(UMAP_PROCESS_GROUP);
  const [selectedProjectPath, setSelectedProjectPath] = useState<string>('');
  const [selectedMapPath, setSelectedMapPath] = useState<string>('');
  const [launchMapAfter, setLaunchMapAfter] = useState(false);
  const [lightingQuality, setLightingQuality] = useState<string>('Production');
  const [running, setRunning] = useState(false);

  const selectedProject = projects.find((p) => p.projectPath === selectedProjectPath);
  const maps = selectedProject?.maps ?? [];

  // When project changes, reset map selection
  useEffect(() => {
    if (!selectedProjectPath) {
      setSelectedMapPath('');
      return;
    }
    const proj = projects.find((p) => p.projectPath === selectedProjectPath);
    if (!proj?.maps.includes(selectedMapPath)) {
      setSelectedMapPath('');
    }
  }, [selectedProjectPath, projects, selectedMapPath]);

  const handleProjectChange = async (value: string) => {
    if (value === '__browse__') {
      setSelectedProjectPath('__browse__');
      const path = await open({
        directory: false,
        filters: [{ name: 'Unreal Project', extensions: ['uproject'] }],
      });
      if (path && typeof path === 'string') {
        try {
          const project = await invoke<ProjectInfo>('analyse_uproject', { path });
          await addProject(project);
          setSelectedProjectPath(project.projectPath);
        } catch (e) {
          console.error('Failed to analyse project:', e);
          setSelectedProjectPath('');
        }
      } else {
        setSelectedProjectPath('');
      }
    } else {
      setSelectedProjectPath(value);
    }
  };

  const runCommand = async (
    builder: string,
    extraArgs: string | null,
    completionLabel: string
  ) => {
    if (!selectedProject || !selectedMapPath) {
      alert('Please select a valid project and map.');
      return;
    }
    const enginePath = selectedProject.engineInstallPath;
    if (!enginePath || enginePath === 'Unknown') {
      alert('Engine path not found for this project. Ensure the project uses an installed engine.');
      return;
    }

    clearLog();
    setRunning(true);
    startProgress();
    try {
      await invoke('run_map_command', {
        projectPath: selectedProject.projectPath,
        mapPath: selectedMapPath,
        builder,
        extraArgs,
        enginePath,
        launchMapAfter,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Map command failed:', e);
      alert(`${completionLabel} failed: ${msg}`);
    } finally {
      setRunning(false);
      finishProgress();
    }
  };

  const handleBuildHLOD = () =>
    runCommand('WorldPartitionHLODsBuilder', null, 'HLOD generation');
  const handleBuildMiniMap = () =>
    runCommand('WorldPartitionMiniMapBuilder', null, 'MiniMap generation');
  const handleDeleteHLOD = () =>
    runCommand('WorldPartitionHLODsBuilder', '-DeleteHLODs', 'HLOD deletion');

  const handleBuildLighting = async () => {
    if (!selectedProject || !selectedMapPath) {
      alert('Please select a valid project and map.');
      return;
    }
    const enginePath = selectedProject.engineInstallPath;
    if (!enginePath || enginePath === 'Unknown') {
      alert('Engine path not found for this project. Ensure the project uses an installed engine.');
      return;
    }

    clearLog();
    setRunning(true);
    startProgress();
    try {
      await invoke('run_build_lighting', {
        projectPath: selectedProject.projectPath,
        mapPath: selectedMapPath,
        enginePath,
        quality: lightingQuality || undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Build lighting failed:', e);
      alert(`Build Static Lighting failed: ${msg}`);
    } finally {
      setRunning(false);
      finishProgress();
    }
  };

  // Map display: show short name (filename without path) in dropdown, but we need full path for the command
  const mapDisplayName = (mapPath: string) => {
    const parts = mapPath.split('/');
    return parts[parts.length - 1] || mapPath;
  };

  return (
    <ToolGroup
      title="UMap Helper"
      description="World Partition (HLOD, MiniMap) and Static Lighting commands for maps."
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-sm text-zinc-300 mb-1">Project</label>
          <select
            value={selectedProjectPath}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          >
            <option value="">
              {projects.length === 0 ? 'No projects available' : 'Select a project'}
            </option>
            {projects.map((p) => (
              <option key={p.projectPath} value={p.projectPath}>
                {p.projectName}
              </option>
            ))}
            <option value="__browse__">Browse new project...</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-zinc-300 mb-1">Map</label>
          <select
            value={selectedMapPath}
            onChange={(e) => setSelectedMapPath(e.target.value)}
            disabled={!selectedProjectPath || maps.length === 0}
            className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:opacity-50"
          >
            <option value="">{maps.length === 0 ? 'Select a map' : 'Select a map'}</option>
            {maps.map((mapPath) => (
              <option key={mapPath} value={mapPath}>
                {mapDisplayName(mapPath)}
              </option>
            ))}
          </select>
          {selectedProjectPath && maps.length === 0 && (
            <p className="mt-1 text-sm text-amber-400/90">No .umap files found in Content/</p>
          )}
        </div>

        {hasBlockingProcesses && (
          <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <p className="font-medium">Cannot build/delete: Unreal Engine is running</p>
            <p className="mt-1 text-amber-200/90">
              {blockingProcesses.map((p) => p.displayName).join(', ')} — close it before running
              HLOD, MiniMap, or static lighting commands.
            </p>
          </div>
        )}

        {/* World Partition section */}
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-zinc-200">World Partition</h4>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleBuildHLOD}
              disabled={!selectedMapPath || running || hasBlockingProcesses}
              className="rounded px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
            >
              Build HLOD
            </button>
            <button
              type="button"
              onClick={handleBuildMiniMap}
              disabled={!selectedMapPath || running || hasBlockingProcesses}
              className="rounded px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
            >
              Build MiniMap
            </button>
            <button
              type="button"
              onClick={handleDeleteHLOD}
              disabled={!selectedMapPath || running || hasBlockingProcesses}
              className="rounded px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium transition-colors"
            >
              Delete HLOD
            </button>
          </div>
          <label className="flex items-center gap-2 text-zinc-300 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={launchMapAfter}
              onChange={(e) => setLaunchMapAfter(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
            />
            Launch map after completion
          </label>
        </div>

        {/* Static Lighting section */}
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-zinc-200">Static Lighting</h4>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBuildLighting}
              disabled={!selectedMapPath || running || hasBlockingProcesses}
              className="rounded px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
            >
              Build Static Lighting
            </button>
            <div className="flex items-center gap-2">
              <label className="text-sm text-zinc-300">Quality:</label>
              <select
                value={lightingQuality}
                onChange={(e) => setLightingQuality(e.target.value)}
                className="rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
              >
                {LIGHTING_QUALITIES.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </ToolGroup>
  );
}
