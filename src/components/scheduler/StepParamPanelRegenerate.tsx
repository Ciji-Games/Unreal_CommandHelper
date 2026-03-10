/**
 * Step param panel for Regenerate Project.
 * Params: project, buildAfter, openProjectAfter, openSlnAfter
 * (versionSelectorPath comes from settings at run time)
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../../hooks/useProjects';
import type { ProjectInfo } from '../../types';

interface StepParamPanelRegenerateProps {
  value: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}

export function StepParamPanelRegenerate({ value, onChange }: StepParamPanelRegenerateProps) {
  const { projects, addProject } = useProjects();
  const projectPath = (value.project as string) ?? '';
  const buildAfter = (value.buildAfter as boolean) ?? false;
  const openProjectAfter = (value.openProjectAfter as boolean) ?? false;
  const openSlnAfter = (value.openSlnAfter as boolean) ?? false;

  const cppProjects = projects.filter((p) => p.isCpp);

  const handleProjectChange = async (v: string) => {
    if (v === '__browse__') {
      const path = await open({
        directory: false,
        filters: [{ name: 'Unreal Project', extensions: ['uproject'] }],
      });
      if (path && typeof path === 'string') {
        try {
          const project = await invoke<ProjectInfo>('analyse_uproject', { path });
          if (!project.isCpp) {
            alert('Regenerate is only for C++ projects (requires Source folder).');
            return;
          }
          await addProject(project);
          onChange({ ...value, project: project.projectPath });
        } catch (e) {
          console.error('Failed to analyse project:', e);
        }
      }
    } else {
      onChange({ ...value, project: v });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-sm text-zinc-300 mb-1">Project (C++ only)</label>
        <select
          value={projectPath}
          onChange={(e) => handleProjectChange(e.target.value)}
          className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
        >
          <option value="">
            {cppProjects.length === 0 ? 'No C++ projects' : 'Select project'}
          </option>
          {cppProjects.map((p) => (
            <option key={p.projectPath} value={p.projectPath}>
              {p.projectName}
            </option>
          ))}
          <option value="__browse__">Browse...</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-zinc-300 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={buildAfter}
            onChange={(e) => onChange({ ...value, buildAfter: e.target.checked })}
            className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
          />
          Build Project
        </label>
        <label className="flex items-center gap-2 text-zinc-300 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={openProjectAfter}
            onChange={(e) => onChange({ ...value, openProjectAfter: e.target.checked })}
            className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
          />
          Launch Project
        </label>
        <label className="flex items-center gap-2 text-zinc-300 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={openSlnAfter}
            onChange={(e) => onChange({ ...value, openSlnAfter: e.target.checked })}
            className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
          />
            Open .sln
        </label>
      </div>
    </div>
  );
}
