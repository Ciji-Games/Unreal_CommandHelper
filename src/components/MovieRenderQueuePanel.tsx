/**
 * Movie Render Queue panel - command-line rendering with UnrealEditor-Cmd.exe.
 * Queue mode: Movie Pipeline Queue asset. Mix-and-match: Level Sequence + Config preset.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../hooks/useProjects';
import { useLog } from '../contexts/LogContext';
import { useProgress } from '../contexts/ProgressContext';
import { useProcessMonitor } from '../hooks/useProcessMonitor';
import { ToolGroup } from './ToolGroup';
import type { ProjectInfo } from '../types';
import { getProjectDisplayLabel } from '../utils/project';
import {
  getContentDir,
  fsPathToUnrealAssetPath,
  type MrqAssetType,
} from '../utils/mrqAssetPath';

const UPROJECT_PROCESS_GROUP = 'uproject';

type MrqMode = 'queue' | 'mix_match';

function AssetPicker({
  label,
  value,
  onChange,
  assetType,
  projectPath,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  assetType: MrqAssetType;
  projectPath: string;
  disabled?: boolean;
}) {
  const handleBrowse = async () => {
    if (!projectPath) return;
    const defaultPath = getContentDir(projectPath);
    const path = await open({
      directory: false,
      filters: [{ name: 'Unreal Asset', extensions: ['uasset'] }],
      defaultPath,
    });
    if (path && typeof path === 'string') {
      const unrealPath = fsPathToUnrealAssetPath(projectPath, path, assetType);
      if (unrealPath) {
        onChange(unrealPath);
      } else {
        alert('Selected file is not under the project Content folder.');
      }
    }
  };

  return (
    <div>
      <label className="block text-sm text-zinc-300 mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          readOnly
          placeholder="Browse to select..."
          className="flex-1 rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none placeholder-zinc-500"
        />
        <button
          type="button"
          onClick={handleBrowse}
          disabled={disabled}
          className="rounded px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium"
        >
          Browse
        </button>
      </div>
    </div>
  );
}

export function MovieRenderQueuePanel() {
  const { projects, addProject } = useProjects();
  const { clearLog } = useLog();
  const { startProgress, finishProgress } = useProgress();
  const { hasBlockingProcesses } = useProcessMonitor(UPROJECT_PROCESS_GROUP);
  const [selectedProjectPath, setSelectedProjectPath] = useState<string>('');
  const [selectedMapPath, setSelectedMapPath] = useState<string>('');
  const [mode, setMode] = useState<MrqMode>('queue');
  const [moviePipelineConfig, setMoviePipelineConfig] = useState<string>('');
  const [levelSequence, setLevelSequence] = useState<string>('');
  const [running, setRunning] = useState(false);

  const selectedProject = projects.find((p) => p.projectPath === selectedProjectPath);
  const maps = selectedProject?.maps ?? [];

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

  const handleRun = async () => {
    if (!selectedProject || !selectedMapPath || !moviePipelineConfig) {
      alert('Please select project, map, and Movie Pipeline Config.');
      return;
    }
    if (mode === 'mix_match' && !levelSequence) {
      alert('In Level Sequence + Config mode, please select a Level Sequence.');
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
      await invoke('run_movie_render_queue', {
        projectPath: selectedProject.projectPath,
        mapPath: selectedMapPath,
        moviePipelineConfig,
        levelSequence: mode === 'mix_match' && levelSequence ? levelSequence : null,
        enginePath,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Movie Render Queue failed:', e);
      alert(`Movie Render Queue failed: ${msg}`);
    } finally {
      setRunning(false);
      finishProgress();
    }
  };

  const mapDisplayName = (mapPath: string) =>
    mapPath.split(/[/\\]/).pop() || mapPath;

  const canRun =
    selectedProject &&
    selectedMapPath &&
    moviePipelineConfig &&
    (mode !== 'mix_match' || levelSequence) &&
    !running &&
    !hasBlockingProcesses;

  return (
    <ToolGroup
      title="Movie Render Queue"
      description="Command-line rendering with UnrealEditor-Cmd. Queue asset or Level Sequence + Config preset."
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
                {getProjectDisplayLabel(p)}
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

        <div>
          <label className="block text-sm text-zinc-300 mb-2">Mode</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-zinc-300 text-sm cursor-pointer">
              <input
                type="radio"
                name="mrq-mode"
                checked={mode === 'queue'}
                onChange={() => setMode('queue')}
                className="border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
              />
              Queue asset
            </label>
            <label className="flex items-center gap-2 text-zinc-300 text-sm cursor-pointer">
              <input
                type="radio"
                name="mrq-mode"
                checked={mode === 'mix_match'}
                onChange={() => setMode('mix_match')}
                className="border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
              />
              Level Sequence + Config
            </label>
          </div>
        </div>

        {mode === 'queue' ? (
          <AssetPicker
            label="Movie Pipeline Queue"
            value={moviePipelineConfig}
            onChange={setMoviePipelineConfig}
            assetType="queue"
            projectPath={selectedProjectPath}
            disabled={!selectedProjectPath}
          />
        ) : (
          <>
            <AssetPicker
              label="Level Sequence"
              value={levelSequence}
              onChange={setLevelSequence}
              assetType="level_sequence"
              projectPath={selectedProjectPath}
              disabled={!selectedProjectPath}
            />
            <AssetPicker
              label="Movie Pipeline Config (preset)"
              value={moviePipelineConfig}
              onChange={setMoviePipelineConfig}
              assetType="config"
              projectPath={selectedProjectPath}
              disabled={!selectedProjectPath}
            />
          </>
        )}

        {hasBlockingProcesses && (
          <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <p className="font-medium">Cannot run: Unreal Engine is running</p>
            <p className="mt-1 text-amber-200/90">Close Unreal Editor before running.</p>
          </div>
        )}

        <p className="text-xs text-zinc-500">
          Browse to select .uasset files from your project&apos;s Content folder. Movie Render Queue
          plugin must be enabled.
        </p>

        <button
          type="button"
          onClick={handleRun}
          disabled={!canRun}
          className="rounded px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
        >
          Run Movie Render Queue
        </button>
      </div>
    </ToolGroup>
  );
}
