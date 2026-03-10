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
        <label className="block text-sm text-zinc-300 mb-1">Output path (directory or .zip file)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={outputPath}
            onChange={(e) => onChange({ ...value, outputPath: e.target.value })}
            placeholder="{project}/ProjectName.zip"
            disabled={!projectPath}
            className="flex-1 rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleBrowseOutputPath}
            disabled={!projectPath}
            className="rounded px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium transition-colors"
          >
            Browse
          </button>
        </div>
      </div>
    </div>
  );
}
