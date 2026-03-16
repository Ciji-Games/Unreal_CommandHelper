/**
 * Plugin Helper panel - build and package plugins. Translation of BuildPlugin.bat.
 * Step 13: List projects with Plugins folder, list plugins, select engine, build, optional zip.
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../hooks/useProjects';
import { useEngines } from '../hooks/useEngines';
import { useLog } from '../contexts/LogContext';
import { useProgress } from '../contexts/ProgressContext';
import { useProcessMonitor } from '../hooks/useProcessMonitor';
import { ToolGroup } from './ToolGroup';
import { Select } from './Select';
import type { ProjectInfo } from '../types';
import { getProjectDisplayLabel, getEngineSelectOptions } from '../utils/project';

const PLUGIN_PROCESS_GROUP = 'umap';

export interface PluginInfo {
  name: string;
  upluginPath: string;
  folderPath: string;
}

export function PluginHelperPanel() {
  const { projects, addProject } = useProjects();
  const { clearLog } = useLog();
  const { startProgress, finishProgress } = useProgress();
  const { runningProcesses: blockingProcesses, hasBlockingProcesses } =
    useProcessMonitor(PLUGIN_PROCESS_GROUP);
  const { engines } = useEngines();
  const [selectedProjectPath, setSelectedProjectPath] = useState<string>('');
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInfo | null>(null);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [selectedEnginePath, setSelectedEnginePath] = useState<string>('');
  const [createZip, setCreateZip] = useState(true);
  const [running, setRunning] = useState(false);

  // Projects that have a Plugins folder
  const [projectsWithPlugins, setProjectsWithPlugins] = useState<ProjectInfo[]>([]);

  // Clear selected engine if it's no longer in the validated list
  useEffect(() => {
    if (engines.length > 0 && !selectedEnginePath) {
      setSelectedEnginePath(engines[0].editorPath);
    } else if (
      selectedEnginePath &&
      engines.length > 0 &&
      !engines.some((e) => e.editorPath === selectedEnginePath)
    ) {
      setSelectedEnginePath(engines[0].editorPath);
    } else if (selectedEnginePath && engines.length === 0) {
      setSelectedEnginePath('');
    }
  }, [engines, selectedEnginePath]);

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
    if (!selectedPlugin || !selectedEnginePath) {
      alert('Please select a plugin and engine.');
      return;
    }

    clearLog();
    setRunning(true);
    startProgress({ showOutputLog: true });
    try {
      const result = await invoke<string>('build_plugin', {
        upluginPath: selectedPlugin.upluginPath,
        enginePath: selectedEnginePath,
        createZip,
      });
      console.log('Build result:', result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Build failed:', e);
      alert(`Build failed: ${msg}`);
    } finally {
      setRunning(false);
      finishProgress();
    }
  };

  return (
    <ToolGroup
      title="Plugin Helper"
      description="Build and package plugins from projects with a Plugins folder. Select project, plugin, engine version, and optionally zip the build."
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-sm text-slate-300 mb-1">Project (with Plugins folder)</label>
          <Select
            value={selectedProjectPath}
            onChange={(v) => handleProjectChange(v)}
            placeholder={projectsWithPlugins.length === 0 ? 'No projects with plugins' : 'Select a project'}
            options={[
              ...projectsWithPlugins.map((p) => ({ value: p.projectPath, label: getProjectDisplayLabel(p) })),
              { value: '__browse__', label: 'Browse new project...' },
            ]}
          />
          {projectsWithPlugins.length === 0 && (
            <p className="mt-1 text-sm text-sky-400/90">
              {projects.length === 0
                ? 'Add projects (via Launcher tab) or browse to select a project with a Plugins folder.'
                : 'No projects with a Plugins folder found. Add one or browse to a project that has Plugins/ next to the .uproject.'}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-1">Plugin</label>
          <Select
            value={selectedPlugin?.upluginPath ?? ''}
            onChange={(v) => {
              const p = plugins.find((pl) => pl.upluginPath === v);
              setSelectedPlugin(p ?? null);
            }}
            placeholder={plugins.length === 0 ? 'No plugins' : 'Select a plugin'}
            disabled={!selectedProjectPath || plugins.length === 0}
            options={plugins.map((p) => ({ value: p.upluginPath, label: p.name }))}
          />
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-1">Engine</label>
          <Select
            value={selectedEnginePath}
            onChange={(v) => setSelectedEnginePath(v)}
            placeholder={engines.length === 0 ? 'No engines found' : 'Select engine'}
            disabled={engines.length === 0}
            options={getEngineSelectOptions(engines)}
          />
        </div>

        <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={createZip}
            onChange={(e) => setCreateZip(e.target.checked)}
            className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
          />
          Zip package (filename: PluginName_EngineVersion.zip)
        </label>

        {hasBlockingProcesses && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
            <p className="font-medium">Cannot build: Unreal Engine is running</p>
            <p className="mt-1 text-amber-100/80">
              {blockingProcesses.map((p) => p.displayName).join(', ')} — close it before building
              the plugin.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={handleBuild}
          disabled={
            !selectedPlugin ||
            !selectedEnginePath ||
            running ||
            selectedProjectPath === '__browse__' ||
            hasBlockingProcesses
          }
          title="Runs RunUAT BuildPlugin. Compiles the plugin for the selected engine version."
          className="rounded-md px-4 py-2 bg-sky-600/80 hover:bg-sky-500/80 disabled:bg-slate-600 disabled:text-slate-500 text-white font-medium transition-colors"
        >
          {running ? 'Building...' : 'Build Plugin'}
        </button>
      </div>
    </ToolGroup>
  );
}
