/**
 * Step param panel for Movie Render Queue.
 * Params: project, map, mode ('queue' | 'mix_match'), moviePipelineConfig, levelSequence (optional).
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../../hooks/useProjects';
import type { ProjectInfo } from '../../types';
import { getProjectDisplayLabel } from '../../utils/project';
import { Select } from '../Select';
import {
  getContentDir,
  fsPathToUnrealAssetPath,
  type MrqAssetType,
} from '../../utils/mrqAssetPath';

interface StepParamPanelMovieRenderQueueProps {
  value: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}

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
      <label className="block text-sm text-slate-300 mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          readOnly
          placeholder="Browse to select..."
          className="flex-1 rounded-md bg-slate-700/50 border border-slate-600 text-slate-100 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/30 placeholder-slate-500"
        />
        <button
          type="button"
          onClick={handleBrowse}
          disabled={disabled}
          className="rounded px-4 py-2 bg-slate-600/80 hover:bg-slate-500/80 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium"
        >
          Browse
        </button>
      </div>
    </div>
  );
}

export function StepParamPanelMovieRenderQueue({ value, onChange }: StepParamPanelMovieRenderQueueProps) {
  const { projects, addProject } = useProjects();
  const projectPath = (value.project as string) ?? '';
  const mapPath = (value.map as string) ?? '';
  const mode = (value.mode as MrqMode) ?? 'queue';
  const moviePipelineConfig = (value.moviePipelineConfig as string) ?? '';
  const levelSequence = (value.levelSequence as string) ?? '';

  const selectedProject = projects.find((p) => p.projectPath === projectPath);
  const maps = selectedProject?.maps ?? [];

  const handleProjectChange = async (v: string) => {
    if (v === '__browse__') {
      const path = await open({
        directory: false,
        filters: [{ name: 'Unreal Project', extensions: ['uproject'] }],
      });
      if (path && typeof path === 'string') {
        try {
          const project = await invoke<ProjectInfo>('analyse_uproject', { path });
          await addProject(project);
          onChange({ ...value, project: project.projectPath, map: '' });
        } catch (e) {
          console.error('Failed to analyse project:', e);
        }
      }
    } else {
      onChange({ ...value, project: v, map: maps.includes(mapPath) ? mapPath : '' });
    }
  };

  const mapDisplayName = (mp: string) => mp.split(/[/\\]/).pop() || mp;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-sm text-slate-300 mb-1">Project</label>
        <Select
          value={projectPath}
          onChange={(v) => handleProjectChange(v)}
          placeholder={projects.length === 0 ? 'No projects' : 'Select project'}
          options={[
            ...projects.map((p) => ({ value: p.projectPath, label: getProjectDisplayLabel(p) })),
            { value: '__browse__', label: 'Browse...' },
          ]}
        />
      </div>
      <div>
        <label className="block text-sm text-slate-300 mb-1">Map</label>
        <Select
          value={mapPath}
          onChange={(v) => onChange({ ...value, map: v })}
          placeholder="Select map"
          disabled={!projectPath || maps.length === 0}
          options={maps.map((mp) => ({ value: mp, label: mapDisplayName(mp) }))}
        />
        {projectPath && maps.length === 0 && (
          <p className="mt-1 text-xs text-slate-500">No .umap files found in Content/</p>
        )}
      </div>
      <div>
        <label className="block text-sm text-slate-300 mb-2">Mode</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
            <input
              type="radio"
              name="mrq-mode"
              checked={mode === 'queue'}
              onChange={() => onChange({ ...value, mode: 'queue' })}
              className="border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
            />
            Queue asset
          </label>
          <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
            <input
              type="radio"
              name="mrq-mode"
              checked={mode === 'mix_match'}
              onChange={() => onChange({ ...value, mode: 'mix_match' })}
              className="border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
            />
            Level Sequence + Config
          </label>
        </div>
      </div>
      {mode === 'queue' ? (
        <AssetPicker
          label="Movie Pipeline Queue"
          value={moviePipelineConfig}
          onChange={(v) => onChange({ ...value, moviePipelineConfig: v })}
          assetType="queue"
          projectPath={projectPath}
          disabled={!projectPath}
        />
      ) : (
        <>
          <AssetPicker
            label="Level Sequence"
            value={levelSequence}
            onChange={(v) => onChange({ ...value, levelSequence: v })}
            assetType="level_sequence"
            projectPath={projectPath}
            disabled={!projectPath}
          />
          <AssetPicker
            label="Movie Pipeline Config (preset)"
            value={moviePipelineConfig}
            onChange={(v) => onChange({ ...value, moviePipelineConfig: v })}
            assetType="config"
            projectPath={projectPath}
            disabled={!projectPath}
          />
        </>
      )}
    </div>
  );
}
