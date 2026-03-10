/**
 * Step param panel for Build Plugin.
 * Params: project, upluginPath, engineVersion, createZip
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../../hooks/useProjects';
import type { ProjectInfo, EngineEntry } from '../../types';
import { getProjectDisplayLabel } from '../../utils/project';

interface PluginInfo {
  name: string;
  upluginPath: string;
  folderPath: string;
}

interface StepParamPanelPluginProps {
  value: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}

export function StepParamPanelPlugin({ value, onChange }: StepParamPanelPluginProps) {
  const { projects, addProject } = useProjects();
  const projectPath = (value.project as string) ?? '';
  const upluginPath = (value.upluginPath as string) ?? '';
  const engineVersion = (value.engineVersion as string) ?? '';
  const createZip = (value.createZip as boolean) ?? true;
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [engines, setEngines] = useState<EngineEntry[]>([]);
  const [projectsWithPlugins, setProjectsWithPlugins] = useState<ProjectInfo[]>([]);

  const loadPluginsForProject = useCallback(async (path: string) => {
    if (!path) {
      setPlugins([]);
      return;
    }
    try {
      const p = await invoke<PluginInfo[]>('list_plugins_for_project', { projectPath: path });
      setPlugins(p);
    } catch {
      setPlugins([]);
    }
  }, []);

  useEffect(() => {
    const check = async () => {
      const withPlugins: ProjectInfo[] = [];
      for (const proj of projects) {
        try {
          const p = await invoke<PluginInfo[]>('list_plugins_for_project', {
            projectPath: proj.projectPath,
          });
          if (p.length > 0) withPlugins.push(proj);
        } catch {
          /* ignore */
        }
      }
      setProjectsWithPlugins(withPlugins);
    };
    check();
  }, [projects]);

  useEffect(() => {
    const load = async () => {
      try {
        const e = await invoke<EngineEntry[]>('get_installed_engine_paths');
        setEngines(e);
      } catch {
        setEngines([]);
      }
    };
    load();
  }, []);

  useEffect(() => {
    loadPluginsForProject(projectPath);
  }, [projectPath, loadPluginsForProject]);

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
          const pluginList = await invoke<PluginInfo[]>('list_plugins_for_project', {
            projectPath: project.projectPath,
          });
          if (pluginList.length === 0) {
            alert('This project has no Plugins folder or no .uplugin files.');
            return;
          }
          onChange({
            ...value,
            project: project.projectPath,
            upluginPath: pluginList[0].upluginPath,
          });
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
        <label className="block text-sm text-zinc-300 mb-1">Project (with Plugins)</label>
        <select
          value={projectPath}
          onChange={(e) => handleProjectChange(e.target.value)}
          className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
        >
          <option value="">
            {projectsWithPlugins.length === 0 ? 'No projects with plugins' : 'Select project'}
          </option>
          {projectsWithPlugins.map((p) => (
            <option key={p.projectPath} value={p.projectPath}>
              {getProjectDisplayLabel(p)}
            </option>
          ))}
          <option value="__browse__">Browse...</option>
        </select>
      </div>
      <div>
        <label className="block text-sm text-zinc-300 mb-1">Plugin</label>
        <select
          value={upluginPath}
          onChange={(e) => onChange({ ...value, upluginPath: e.target.value })}
          disabled={!projectPath || plugins.length === 0}
          className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:opacity-50"
        >
          <option value="">{plugins.length === 0 ? 'No plugins' : 'Select plugin'}</option>
          {plugins.map((p) => (
            <option key={p.upluginPath} value={p.upluginPath}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm text-zinc-300 mb-1">Engine version</label>
        <select
          value={engineVersion}
          onChange={(e) => onChange({ ...value, engineVersion: e.target.value })}
          disabled={engines.length === 0}
          className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:opacity-50"
        >
          <option value="">{engines.length === 0 ? 'No engines' : 'Select engine'}</option>
          {engines.map((e) => (
            <option key={e.version} value={e.version}>
              {e.version}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-zinc-300 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={createZip}
          onChange={(e) => onChange({ ...value, createZip: e.target.checked })}
          className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
        />
        Zip package (PluginName_EngineVersion.zip)
      </label>
    </div>
  );
}
