/**
 * Step param panel for Cook, Package, Build.
 * Cook: project, platform
 * Package: project, platform, config, archiveDirectory
 * Build: project
 */

import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../../hooks/useProjects';
import type { ProjectInfo } from '../../types';
import { getProjectDisplayLabel } from '../../utils/project';

const PLATFORMS = ['Win64', 'Linux', 'Mac'];
const PACKAGE_CONFIGS = ['Development', 'Shipping'];

interface StepParamPanelUProjectProps {
  stepId: 'cook' | 'package' | 'build';
  value: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}

export function StepParamPanelUProject({ stepId, value, onChange }: StepParamPanelUProjectProps) {
  const { projects, addProject } = useProjects();
  const projectPath = (value.project as string) ?? '';
  const platform = (value.platform as string) ?? 'Win64';
  const packageConfig = (value.config as string) ?? 'Development';
  const outputPath = (value.outputPath as string) ?? (value.archiveDirectory as string) ?? '';

  const prevProjectRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectPath || stepId !== 'package') return;
    if (prevProjectRef.current === projectPath) return;
    if (prevProjectRef.current === null && outputPath) {
      prevProjectRef.current = projectPath;
      return;
    }
    prevProjectRef.current = projectPath;
    const sep = Math.max(projectPath.lastIndexOf('/'), projectPath.lastIndexOf('\\'));
    const projectDir = sep >= 0 ? projectPath.slice(0, sep) : projectPath;
    onChange({ ...value, outputPath: `${projectDir}/Saved/StagedBuilds` });
  }, [projectPath, stepId]);

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
          const updates: Record<string, unknown> = { project: project.projectPath };
          if (stepId === 'package') updates.outputPath = `${projectDir}/Saved/StagedBuilds`;
          onChange({ ...value, ...updates });
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
          disabled={projects.length === 0}
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
      {(stepId === 'cook' || stepId === 'package') && (
        <div>
          <label className="block text-sm text-zinc-300 mb-1">Platform</label>
          <select
            value={platform}
            onChange={(e) => onChange({ ...value, platform: e.target.value })}
            disabled={!projectPath}
            className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:opacity-50"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}
      {stepId === 'package' && (
        <>
          <div>
            <label className="block text-sm text-zinc-300 mb-1">Package Config</label>
            <select
              value={packageConfig}
              onChange={(e) => onChange({ ...value, config: e.target.value })}
              disabled={!projectPath}
              className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:opacity-50"
            >
              {PACKAGE_CONFIGS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-zinc-300 mb-1">Output path</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={outputPath}
                onChange={(e) => onChange({ ...value, outputPath: e.target.value })}
                placeholder="{project}/Saved/StagedBuilds"
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
        </>
      )}
    </div>
  );
}
