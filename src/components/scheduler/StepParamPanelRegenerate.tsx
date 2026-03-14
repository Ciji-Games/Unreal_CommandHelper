/**
 * Step param panel for Regenerate Project.
 * Params: project, buildAfter, openProjectAfter, openSlnAfter
 * (versionSelectorPath comes from settings at run time)
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../../hooks/useProjects';
import type { ProjectInfo } from '../../types';
import { getProjectDisplayLabel } from '../../utils/project';
import { Select } from '../Select';

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
        <label className="block text-sm text-slate-300 mb-1">Project (C++ only)</label>
        <Select
          value={projectPath}
          onChange={(v) => handleProjectChange(v)}
          placeholder={cppProjects.length === 0 ? 'No C++ projects' : 'Select project'}
          options={[
            ...cppProjects.map((p) => ({ value: p.projectPath, label: getProjectDisplayLabel(p) })),
            { value: '__browse__', label: 'Browse...' },
          ]}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={buildAfter}
            onChange={(e) => onChange({ ...value, buildAfter: e.target.checked })}
            className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
          />
          Build Project
        </label>
        <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={openProjectAfter}
            onChange={(e) => onChange({ ...value, openProjectAfter: e.target.checked })}
            className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
          />
          Launch Project
        </label>
        <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={openSlnAfter}
            onChange={(e) => onChange({ ...value, openSlnAfter: e.target.checked })}
            className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
          />
            Open .sln
        </label>
      </div>
    </div>
  );
}
