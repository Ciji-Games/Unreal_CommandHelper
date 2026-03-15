/**
 * Step param panel for ResavePackages.
 * Params: project, fixupRedirects, autocheckout, projectOnly, autocheckin
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../../hooks/useProjects';
import type { ProjectInfo } from '../../types';
import { getProjectDisplayLabel } from '../../utils/project';
import { Select } from '../Select';

interface StepParamPanelResavePackagesProps {
  value: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}

export function StepParamPanelResavePackages({ value, onChange }: StepParamPanelResavePackagesProps) {
  const { projects, addProject } = useProjects();
  const projectPath = (value.project as string) ?? '';
  const fixupRedirects = (value.fixupRedirects as boolean) ?? true;
  const autocheckout = (value.autocheckout as boolean) ?? false;
  const projectOnly = (value.projectOnly as boolean) ?? true;
  const autocheckin = (value.autocheckin as boolean) ?? false;

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
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={fixupRedirects}
            onChange={(e) => onChange({ ...value, fixupRedirects: e.target.checked })}
            className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
          />
          Fixup redirectors
        </label>
        <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={autocheckout}
            onChange={(e) => onChange({ ...value, autocheckout: e.target.checked })}
            className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
          />
          Auto checkout
        </label>
        <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={projectOnly}
            onChange={(e) => onChange({ ...value, projectOnly: e.target.checked })}
            className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
          />
          Project only
        </label>
        <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={autocheckin}
            onChange={(e) => onChange({ ...value, autocheckin: e.target.checked })}
            className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
          />
          Auto checkin
        </label>
      </div>
    </div>
  );
}
