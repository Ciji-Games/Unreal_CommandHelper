/**
 * Step param panel for map commands: Delete HLOD, Build HLOD, Build MiniMap.
 * Params: project, map, launchMapAfter
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../../hooks/useProjects';
import type { ProjectInfo } from '../../types';
import { getProjectDisplayLabel } from '../../utils/project';

interface StepParamPanelMapProps {
  value: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}

export function StepParamPanelMap({ value, onChange }: StepParamPanelMapProps) {
  const { projects, addProject } = useProjects();
  const projectPath = (value.project as string) ?? '';
  const mapPath = (value.map as string) ?? '';
  const launchMapAfter = (value.launchMapAfter as boolean) ?? false;

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
        <label className="block text-sm text-zinc-300 mb-1">Project</label>
        <select
          value={projectPath}
          onChange={(e) => handleProjectChange(e.target.value)}
          className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
        >
          <option value="">{projects.length === 0 ? 'No projects' : 'Select project'}</option>
          {projects.map((p) => (
            <option key={p.projectPath} value={p.projectPath}>
              {getProjectDisplayLabel(p)}
            </option>
          ))}
          <option value="__browse__">Browse...</option>
        </select>
      </div>
      <div>
        <label className="block text-sm text-zinc-300 mb-1">Map</label>
        <select
          value={mapPath}
          onChange={(e) => onChange({ ...value, map: e.target.value })}
          disabled={!projectPath || maps.length === 0}
          className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:opacity-50"
        >
          <option value="">Select map</option>
          {maps.map((mp) => (
            <option key={mp} value={mp}>
              {mapDisplayName(mp)}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-zinc-300 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={launchMapAfter}
          onChange={(e) => onChange({ ...value, launchMapAfter: e.target.checked })}
          className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
        />
        Launch map after completion
      </label>
    </div>
  );
}
