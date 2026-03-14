/**
 * Step param panel for Launch Project.
 * Params: project (required), map (optional).
 * If map is empty, launches project normally. If map is set, launches with that map.
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../../hooks/useProjects';
import type { ProjectInfo } from '../../types';
import { getProjectDisplayLabel } from '../../utils/project';
import { Select } from '../Select';

interface StepParamPanelLaunchProps {
  value: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}

export function StepParamPanelLaunch({ value, onChange }: StepParamPanelLaunchProps) {
  const { projects, addProject } = useProjects();
  const projectPath = (value.project as string) ?? '';
  const mapPath = (value.map as string) ?? '';

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
        <label className="block text-sm text-slate-300 mb-1">Map (optional)</label>
        <Select
          value={mapPath}
          onChange={(v) => onChange({ ...value, map: v })}
          placeholder="Launch without map"
          disabled={!projectPath || maps.length === 0}
          options={maps.map((mp) => ({ value: mp, label: mapDisplayName(mp) }))}
        />
        {projectPath && maps.length === 0 && (
          <p className="mt-1 text-xs text-slate-500">No .umap files found in Content/</p>
        )}
      </div>
    </div>
  );
}
