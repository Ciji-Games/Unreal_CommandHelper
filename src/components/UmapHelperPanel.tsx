/**
 * UMap Helper panel - HLOD, MiniMap, static lighting, Delete HLOD commandlets.
 * Step 11: Mirrors UmapHelper.cs
 */

const LIGHTING_QUALITIES = ['Preview', 'Medium', 'High', 'Production', 'MAX'] as const;

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../hooks/useProjects';
import { useSettings } from '../hooks/useSettings';
import { useLog } from '../contexts/LogContext';
import { useProgress } from '../contexts/ProgressContext';
import { useProcessMonitor } from '../hooks/useProcessMonitor';
import { ToolGroup } from './ToolGroup';
import { Select } from './Select';
import type { ProjectInfo } from '../types';
import { getProjectDisplayLabel, getShortEngineVersion } from '../utils/project';

const UMAP_PROCESS_GROUP = 'umap';

export function UmapHelperPanel() {
  const { projects, addProject } = useProjects();
  const { settings } = useSettings();
  const { clearLog } = useLog();
  const { startProgress, finishProgress } = useProgress();
  const { runningProcesses: blockingProcesses, hasBlockingProcesses } =
    useProcessMonitor(UMAP_PROCESS_GROUP);
  const [selectedProjectPath, setSelectedProjectPath] = useState<string>('');
  const [selectedMapPath, setSelectedMapPath] = useState<string>('');
  const [launchMapAfter, setLaunchMapAfter] = useState(false);
  const [lightingQuality, setLightingQuality] = useState<string>('Production');
  const [running, setRunning] = useState(false);
  const [resaveActorClass, setResaveActorClass] = useState('');
  const [foliageGridSize, setFoliageGridSize] = useState(512);
  const [renameDuplicateNewPackage, setRenameDuplicateNewPackage] = useState('/Game/Maps/NewPackage');
  const [renameDuplicateRename, setRenameDuplicateRename] = useState(false);

  const selectedProject = projects.find((p) => p.projectPath === selectedProjectPath);
  const maps = selectedProject?.maps ?? [];
  const isUE5 = !getShortEngineVersion(selectedProject?.engineVersion ?? '').startsWith('4.');
  const effectiveEnginePath =
    selectedProject && settings.projectEngineOverrides
      ? settings.projectEngineOverrides[selectedProject.projectPath] ?? selectedProject.engineInstallPath
      : selectedProject?.engineInstallPath ?? '';

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
    const enginePath = effectiveEnginePath;
    if (!enginePath || enginePath === 'Unknown') {
      alert('Engine path not found for this project. Ensure the project uses an installed engine.');
      return;
    }

    clearLog();
    setRunning(true);
    startProgress({ showOutputLog: true });
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

  const handleResaveActors = () => {
    let extra = '-SCCProvider=None';
    if (resaveActorClass.trim()) extra += ` -ActorClass=${resaveActorClass.trim()}`;
    runCommand('WorldPartitionResaveActorsBuilder', extra, 'Resave Actors');
  };
  const handleFoliageBuilder = () =>
    runCommand('WorldPartitionFoliageBuilder', `-SCCProvider=None -NewGridSize=${foliageGridSize}`, 'Foliage Builder');
  const handleNavigationData = () =>
    runCommand('WorldPartitionNavigationDataBuilder', '-SCCProvider=None', 'Navigation Data Builder');
  const handleRenameDuplicate = () => {
    const pkg = renameDuplicateNewPackage.trim();
    if (!pkg) {
      alert('Please enter a NewPackage path (e.g. /Game/Maps/NewPackage).');
      return;
    }
    let extra = `-SCCProvider=None -NewPackage=${pkg}`;
    if (renameDuplicateRename) extra += ' -Rename';
    runCommand('WorldPartitionRenameDuplicateBuilder', extra, 'Rename/Duplicate Map');
  };

  const handleBuildLighting = async () => {
    if (!selectedProject || !selectedMapPath) {
      alert('Please select a valid project and map.');
      return;
    }
    const enginePath = effectiveEnginePath;
    if (!enginePath || enginePath === 'Unknown') {
      alert('Engine path not found for this project. Ensure the project uses an installed engine.');
      return;
    }

    clearLog();
    setRunning(true);
    startProgress({ showOutputLog: true });
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
          <label className="block text-sm text-slate-300 mb-1">Project</label>
          <Select
            value={selectedProjectPath}
            onChange={(v) => handleProjectChange(v)}
            placeholder={projects.length === 0 ? 'No projects available' : 'Select a project'}
            options={[
              ...projects.map((p) => ({ value: p.projectPath, label: getProjectDisplayLabel(p) })),
              { value: '__browse__', label: 'Browse new project...' },
            ]}
          />
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-1">Map</label>
          <Select
            value={selectedMapPath}
            onChange={(v) => setSelectedMapPath(v)}
            placeholder="Select a map"
            disabled={!selectedProjectPath || maps.length === 0}
            options={maps.map((mapPath) => ({ value: mapPath, label: mapDisplayName(mapPath) }))}
          />
          {selectedProjectPath && maps.length === 0 && (
            <p className="mt-1 text-sm text-sky-400/90">No .umap files found in Content/</p>
          )}
        </div>

        {hasBlockingProcesses && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
            <p className="font-medium">Cannot build/delete: Unreal Engine is running</p>
            <p className="mt-1 text-amber-100/80">
              {blockingProcesses.map((p) => p.displayName).join(', ')} — close it before running
              HLOD, MiniMap, World Partition builders, or static lighting commands.
            </p>
          </div>
        )}

        {/* World Partition section */}
        {isUE5 && (
          <>
            <div className="rounded-lg border border-slate-600/60 bg-slate-700/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-200">World Partition</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleBuildHLOD}
                  disabled={!selectedMapPath || running || hasBlockingProcesses}
                  title="Runs WorldPartitionBuilderCommandlet with WorldPartitionHLODsBuilder. Generates Hierarchical LODs for the World Partition map."
                  className="rounded-md px-4 py-2 bg-sky-600/80 hover:bg-sky-500/80 disabled:bg-slate-600 disabled:text-slate-500 text-white font-medium transition-colors"
                >
                  Build HLOD
                </button>
                <button
                  type="button"
                  onClick={handleBuildMiniMap}
                  disabled={!selectedMapPath || running || hasBlockingProcesses}
                  title="Runs WorldPartitionBuilderCommandlet with WorldPartitionMiniMapBuilder. Generates minimap texture for the World Partition map."
                  className="rounded-md px-4 py-2 bg-sky-600/80 hover:bg-sky-500/80 disabled:bg-slate-600 disabled:text-slate-500 text-white font-medium transition-colors"
                >
                  Build MiniMap
                </button>
                <button
                  type="button"
                  onClick={handleDeleteHLOD}
                  disabled={!selectedMapPath || running || hasBlockingProcesses}
                  title="Runs WorldPartitionBuilderCommandlet with WorldPartitionHLODsBuilder -DeleteHLODs. Removes all HLOD assets from the map."
                  className="rounded-md px-4 py-2 bg-slate-600/80 hover:bg-slate-500/80 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium transition-colors"
                >
                  Delete HLOD
                </button>
              </div>
              <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={launchMapAfter}
                  onChange={(e) => setLaunchMapAfter(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
                />
                Launch map after completion
              </label>
            </div>

            {/* World Partition Builders (Resave, Foliage, Nav, Rename/Duplicate) */}
            <div className="rounded-lg border border-slate-600/60 bg-slate-700/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-200">World Partition Builders</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleResaveActors}
                  disabled={!selectedMapPath || running || hasBlockingProcesses}
                  title="Runs WorldPartitionBuilderCommandlet with WorldPartitionResaveActorsBuilder. Resaves all or filtered actors in the World Partition map."
                  className="rounded-md px-4 py-2 bg-sky-600/80 hover:bg-sky-500/80 disabled:bg-slate-600 disabled:text-slate-500 text-white font-medium transition-colors"
                >
                  Resave Actors
                </button>
                <button
                  type="button"
                  onClick={handleFoliageBuilder}
                  disabled={!selectedMapPath || running || hasBlockingProcesses}
                  title="Runs WorldPartitionBuilderCommandlet with WorldPartitionFoliageBuilder. Adjusts instanced foliage grid size."
                  className="rounded-md px-4 py-2 bg-sky-600/80 hover:bg-sky-500/80 disabled:bg-slate-600 disabled:text-slate-500 text-white font-medium transition-colors"
                >
                  Foliage Builder
                </button>
                <button
                  type="button"
                  onClick={handleNavigationData}
                  disabled={!selectedMapPath || running || hasBlockingProcesses}
                  title="Runs WorldPartitionBuilderCommandlet with WorldPartitionNavigationDataBuilder. Rebuilds navigation mesh data for the World Partition map."
                  className="rounded-md px-4 py-2 bg-sky-600/80 hover:bg-sky-500/80 disabled:bg-slate-600 disabled:text-slate-500 text-white font-medium transition-colors"
                >
                  Navigation Data
                </button>
                <button
                  type="button"
                  onClick={handleRenameDuplicate}
                  disabled={!selectedMapPath || running || hasBlockingProcesses}
                  title="Runs WorldPartitionBuilderCommandlet with WorldPartitionRenameDuplicateBuilder. Duplicates or renames the World Partition level including all actors."
                  className="rounded-md px-4 py-2 bg-sky-600/80 hover:bg-sky-500/80 disabled:bg-slate-600 disabled:text-slate-500 text-white font-medium transition-colors"
                >
                  Rename/Duplicate Map
                </button>
              </div>
              <div className="flex flex-wrap gap-4 items-center text-sm">
                <div className="flex items-center gap-2">
                  <label className="text-slate-400">Resave Actors class:</label>
                  <input
                    type="text"
                    value={resaveActorClass}
                    onChange={(e) => setResaveActorClass(e.target.value)}
                    placeholder="e.g. StaticMeshActor"
                    className="w-40 rounded-md bg-slate-700/50 border border-slate-600 text-slate-100 px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-slate-400">Foliage grid size:</label>
                  <input
                    type="number"
                    value={foliageGridSize}
                    onChange={(e) => setFoliageGridSize(parseInt(e.target.value, 10) || 512)}
                    min={64}
                    max={4096}
                    className="w-20 rounded-md bg-slate-700/50 border border-slate-600 text-slate-100 px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-slate-400">Rename/Duplicate NewPackage:</label>
                  <input
                    type="text"
                    value={renameDuplicateNewPackage}
                    onChange={(e) => setRenameDuplicateNewPackage(e.target.value)}
                    placeholder="/Game/Maps/NewPackage"
                    className="w-48 rounded-md bg-slate-700/50 border border-slate-600 text-slate-100 px-2 py-1 text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={renameDuplicateRename}
                    onChange={(e) => setRenameDuplicateRename(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
                  />
                  Rename (instead of duplicate)
                </label>
              </div>
            </div>
          </>
        )}

        {/* Static Lighting section */}
        <div className="rounded-lg border border-slate-600/60 bg-slate-700/30 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-slate-200">Static Lighting</h4>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBuildLighting}
              disabled={!selectedMapPath || running || hasBlockingProcesses}
              title="Runs UnrealEditor.exe -run=ResavePackages -BuildLighting. Bakes static lighting for the selected map."
              className="rounded-md px-4 py-2 bg-sky-600/80 hover:bg-sky-500/80 disabled:bg-slate-600 disabled:text-slate-500 text-white font-medium transition-colors"
            >
              Build Static Lighting
            </button>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-300">Quality:</label>
              <Select
                value={lightingQuality}
                onChange={(v) => setLightingQuality(v)}
                options={LIGHTING_QUALITIES.map((q) => ({ value: q, label: q }))}
                className="min-w-[7rem]"
              />
            </div>
          </div>
        </div>
      </div>
    </ToolGroup>
  );
}
