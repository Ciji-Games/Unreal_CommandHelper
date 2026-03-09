/**
 * Plugin Helper panel - build and package plugins. Translation of BuildPlugin.bat.
 * Step 13: List projects with Plugins folder, list plugins, select engine, build, optional zip.
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../hooks/useProjects';
import { useLog } from '../contexts/LogContext';
import { ToolGroup } from './ToolGroup';
import type { ProjectInfo } from '../types';
import type { EngineEntry } from '../types';

export interface PluginInfo {
  name: string;
  upluginPath: string;
  folderPath: string;
}

export function PluginHelperPanel() {
  const { projects, addProject } = useProjects();
  const { clearLog } = useLog();
  const [selectedProjectPath, setSelectedProjectPath] = useState<string>('');
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInfo | null>(null);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [engines, setEngines] = useState<EngineEntry[]>([]);
  const [selectedEngineVersion, setSelectedEngineVersion] = useState<string>('');
  const [createZip, setCreateZip] = useState(true);
  const [running, setRunning] = useState(false);

  // Projects that have a Plugins folder
  const [projectsWithPlugins, setProjectsWithPlugins] = useState<ProjectInfo[]>([]);

  const loadEngines = useCallback(async () => {
    try {
      const e = await invoke<EngineEntry[]>('get_installed_engine_paths');
      setEngines(e);
      if (e.length > 0 && !selectedEngineVersion) {
        setSelectedEngineVersion(e[0].version);
      }
    } catch {
      setEngines([]);
    }
  }, [selectedEngineVersion]);

  const loadPluginsForProject = useCallback(async (projectPath: string) => {
    if (!projectPath) {
      setPlugins([]);
      setSelectedPlugin(null);
      return;
    }
    try {
      const p = await invoke<PluginInfo[]>('list_plugins_for_project', { projectPath });
      setPlugins(p);
      setSelectedPlugin(p.length > 0 ? p[0] : null);
    } catch {
      setPlugins([]);
      setSelectedPlugin(null);
    }
  }, []);

  // When projects change, find those with Plugins folder
  useEffect(() => {
    const checkPlugins = async () => {
      const withPlugins: ProjectInfo[] = [];
      for (const proj of projects) {
        try {
          const p = await invoke<PluginInfo[]>('list_plugins_for_project', {
            projectPath: proj.projectPath,
          });
          if (p.length > 0) {
            withPlugins.push(proj);
          }
        } catch {
          // ignore
        }
      }
      setProjectsWithPlugins(withPlugins);
    };
    checkPlugins();
  }, [projects]);

  useEffect(() => {
    loadEngines();
  }, [loadEngines]);

  useEffect(() => {
    loadPluginsForProject(selectedProjectPath);
  }, [selectedProjectPath, loadPluginsForProject]);

  const handleProjectChange = async (value: string) => {
    if (value === '__browse__') {
      setSelectedProjectPath('__browse__');
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
            alert('This project has no Plugins folder or no .uplugin files found.');
            setSelectedProjectPath('');
            return;
          }
          setSelectedProjectPath(project.projectPath);
        } catch (e) {
          console.error('Failed to analyse project:', e);
          setSelectedProjectPath('');
        }
      } else {
        setSelectedProjectPath('');
      }
    } else {
      setSelectedProjectPath(value);
    }
  };

  const handleBuild = async () => {
    if (!selectedPlugin || !selectedEngineVersion) {
      alert('Please select a plugin and engine version.');
      return;
    }

    clearLog();
    setRunning(true);
    try {
      const result = await invoke<string>('build_plugin', {
        upluginPath: selectedPlugin.upluginPath,
        engineVersion: selectedEngineVersion,
        createZip,
      });
      console.log('Build result:', result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Build failed:', e);
      alert(`Build failed: ${msg}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <ToolGroup
      title="Plugin Helper"
      description="Build and package plugins from projects with a Plugins folder. Select project, plugin, engine version, and optionally zip the build."
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-sm text-zinc-300 mb-1">Project (with Plugins folder)</label>
          <select
            value={selectedProjectPath}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          >
            <option value="">
              {projectsWithPlugins.length === 0
                ? 'No projects with plugins'
                : 'Select a project'}
            </option>
            {projectsWithPlugins.map((p) => (
              <option key={p.projectPath} value={p.projectPath}>
                {p.projectName}
              </option>
            ))}
            <option value="__browse__">Browse new project...</option>
          </select>
          {projectsWithPlugins.length === 0 && (
            <p className="mt-1 text-sm text-amber-400/90">
              {projects.length === 0
                ? 'Add projects (via Launcher tab) or browse to select a project with a Plugins folder.'
                : 'No projects with a Plugins folder found. Add one or browse to a project that has Plugins/ next to the .uproject.'}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm text-zinc-300 mb-1">Plugin</label>
          <select
            value={selectedPlugin?.upluginPath ?? ''}
            onChange={(e) => {
              const p = plugins.find((pl) => pl.upluginPath === e.target.value);
              setSelectedPlugin(p ?? null);
            }}
            disabled={!selectedProjectPath || plugins.length === 0}
            className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:opacity-50"
          >
            <option value="">{plugins.length === 0 ? 'No plugins' : 'Select a plugin'}</option>
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
            value={selectedEngineVersion}
            onChange={(e) => setSelectedEngineVersion(e.target.value)}
            disabled={engines.length === 0}
            className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:opacity-50"
          >
            <option value="">{engines.length === 0 ? 'No engines found' : 'Select engine'}</option>
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
            onChange={(e) => setCreateZip(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
          />
          Zip package (filename: PluginName_EngineVersion.zip)
        </label>

        <button
          type="button"
          onClick={handleBuild}
          disabled={
            !selectedPlugin ||
            !selectedEngineVersion ||
            running ||
            selectedProjectPath === '__browse__'
          }
          className="rounded px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
        >
          {running ? 'Building...' : 'Build Plugin'}
        </button>
      </div>
    </ToolGroup>
  );
}
