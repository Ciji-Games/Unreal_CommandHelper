/**
 * Step param panel for Archive (ZipProjectUp).
 * Params: project, outputPath (directory or .zip path; used as output for ZipProjectUp)
 */

import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../../hooks/useProjects';
import type { ProjectInfo } from '../../types';
import { getProjectDisplayLabel } from '../../utils/project';
import { Select } from '../Select';

interface StepParamPanelArchiveProps {
  value: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}

export function StepParamPanelArchive({ value, onChange }: StepParamPanelArchiveProps) {
  const { projects, addProject } = useProjects();
  const projectPath = (value.project as string) ?? '';
  const outputPath = (value.outputPath as string) ?? (value.outputZipPath as string) ?? '';
  const prevProjectRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectPath) return;
    if (prevProjectRef.current === projectPath) return;
    if (prevProjectRef.current === null && outputPath) {
      prevProjectRef.current = projectPath;
      return;
    }
    prevProjectRef.current = projectPath;
    const lastSlash = projectPath.lastIndexOf('/');
    const backslash = projectPath.lastIndexOf('\\');
    const sep = lastSlash > backslash ? lastSlash : backslash;
    const projectDir = sep >= 0 ? projectPath.slice(0, sep) : projectPath;
    const pn = projectPath.split(/[/\\]/).pop()?.replace(/\.uproject$/, '') ?? 'Project';
    onChange({ ...value, outputPath: `${projectDir}/${pn}.zip` });
  }, [projectPath]);

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
          const sep = Math.max(project.projectPath.lastIndexOf('/'), project.projectPath.lastIndexOf('\\'));
          const projectDir = sep >= 0 ? project.projectPath.slice(0, sep) : project.projectPath;
          const pn = project.projectPath.split(/[/\\]/).pop()?.replace(/\.uproject$/, '') ?? 'Project';
          onChange({ ...value, project: project.projectPath, outputPath: `${projectDir}/${pn}.zip` });
        } catch (e) {
          console.error('Failed to analyse project:', e);
        }
      }
    } else {
      onChange({ ...value, project: v });
    }
  };

  const handleBrowseOutputPath = async () => {
    const path = await open({ directory: true });
    if (path && typeof path === 'string') onChange({ ...value, outputPath: path });
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
      <div>
        <label className="block text-sm text-slate-300 mb-1">Output path (directory or .zip file)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={outputPath}
            onChange={(e) => onChange({ ...value, outputPath: e.target.value })}
            placeholder="{project}/ProjectName.zip"
            disabled={!projectPath}
            className="flex-1 rounded-md bg-slate-700/50 border border-slate-600 text-slate-100 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/30 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleBrowseOutputPath}
            disabled={!projectPath}
            className="rounded px-3 py-2 bg-slate-600/80 hover:bg-slate-500/80 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium transition-colors"
          >
            Browse
          </button>
        </div>
      </div>
    </div>
  );
}
