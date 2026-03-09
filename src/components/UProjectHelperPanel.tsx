/**
 * UProject Helper panel - Cook Content, Package (BuildCookRun), Build (Compile only).
 * Step 13: Mirrors UProjectHelper.cs
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../hooks/useProjects';
import { useLog } from '../contexts/LogContext';
import { useProgress } from '../contexts/ProgressContext';
import { useProcessMonitor } from '../hooks/useProcessMonitor';
import { ToolGroup } from './ToolGroup';
import type { ProjectInfo } from '../types';

const UPROJECT_PROCESS_GROUP = 'uproject';
const PLATFORMS = ['Win64', 'Linux', 'Mac'];
const PACKAGE_CONFIGS = ['Development', 'Shipping'];

export function UProjectHelperPanel() {
  const { projects, addProject } = useProjects();
  const { clearLog } = useLog();
  const { startProgress, finishProgress } = useProgress();
  const { runningProcesses: blockingProcesses, hasBlockingProcesses } =
    useProcessMonitor(UPROJECT_PROCESS_GROUP);
  const [selectedProjectPath, setSelectedProjectPath] = useState<string>('');
  const [platform, setPlatform] = useState('Win64');
  const [packageConfig, setPackageConfig] = useState('Development');
  const [archiveDirectory, setArchiveDirectory] = useState<string>('');
  const [running, setRunning] = useState(false);

  const selectedProject = projects.find((p) => p.projectPath === selectedProjectPath);

  // Default archive directory: {project_dir}/Saved/StagedBuilds (reset when project changes)
  useEffect(() => {
    if (!selectedProjectPath) {
      setArchiveDirectory('');
      return;
    }
    const lastSlash = selectedProjectPath.lastIndexOf('/');
    const backslash = selectedProjectPath.lastIndexOf('\\');
    const sep = lastSlash > backslash ? lastSlash : backslash;
    const projectDir = sep >= 0 ? selectedProjectPath.slice(0, sep) : selectedProjectPath;
    const defaultArchive = `${projectDir}/Saved/StagedBuilds`;
    setArchiveDirectory(defaultArchive);
  }, [selectedProjectPath]);

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

  const handleBrowseArchiveDir = async () => {
    const path = await open({
      directory: true,
    });
    if (path && typeof path === 'string') {
      setArchiveDirectory(path);
    }
  };

  const runCook = async () => {
    if (!selectedProject) return;
    const enginePath = selectedProject.engineInstallPath;
    if (!enginePath || enginePath === 'Unknown') {
      alert('Engine path not found for this project. Ensure the project uses an installed engine.');
      return;
    }
    clearLog();
    setRunning(true);
    startProgress();
    try {
      await invoke('run_cook', {
        projectPath: selectedProject.projectPath,
        platform,
        enginePath,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Cook failed:', e);
      alert(`Cook failed: ${msg}`);
    } finally {
      setRunning(false);
      finishProgress();
    }
  };

  const runPackage = async () => {
    if (!selectedProject) return;
    const enginePath = selectedProject.engineInstallPath;
    if (!enginePath || enginePath === 'Unknown') {
      alert('Engine path not found for this project. Ensure the project uses an installed engine.');
      return;
    }
    if (!archiveDirectory.trim()) {
      alert('Please set the archive output directory.');
      return;
    }
    clearLog();
    setRunning(true);
    startProgress();
    try {
      await invoke('run_package', {
        projectPath: selectedProject.projectPath,
        platform,
        clientConfig: packageConfig,
        archiveDirectory: archiveDirectory.trim(),
        enginePath,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Package failed:', e);
      alert(`Package failed: ${msg}`);
    } finally {
      setRunning(false);
      finishProgress();
    }
  };

  const runBuild = async () => {
    if (!selectedProject) return;
    if (!selectedProject.isCpp) {
      alert('Build is only for C++ projects. This project has no Source folder.');
      return;
    }
    const enginePath = selectedProject.engineInstallPath;
    if (!enginePath || enginePath === 'Unknown') {
      alert('Engine path not found for this project. Ensure the project uses an installed engine.');
      return;
    }
    clearLog();
    setRunning(true);
    startProgress();
    try {
      await invoke('run_build', {
        projectPath: selectedProject.projectPath,
        enginePath,
        isCpp: selectedProject.isCpp,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Build failed:', e);
      alert(`Build failed: ${msg}`);
    } finally {
      setRunning(false);
      finishProgress();
    }
  };

  const canRun = !!selectedProject && !running && !hasBlockingProcesses;
  const canBuild = canRun && selectedProject?.isCpp;

  return (
    <ToolGroup
      title="UProject Helper"
      description="Cook content, Package (Build+Cook+Stage+Pak), or Build (compile only)."
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-sm text-zinc-300 mb-1">Project</label>
          <select
            value={selectedProjectPath}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          >
            <option value="">
              {projects.length === 0 ? 'No projects available' : 'Select a project'}
            </option>
            {projects.map((p) => (
              <option key={p.projectPath} value={p.projectPath}>
                {p.projectName}
              </option>
            ))}
            <option value="__browse__">Browse new project...</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-zinc-300 mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              disabled={!selectedProjectPath}
              className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:opacity-50"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-zinc-300 mb-1">Package Config</label>
            <select
              value={packageConfig}
              onChange={(e) => setPackageConfig(e.target.value)}
              disabled={!selectedProjectPath}
              className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:opacity-50"
            >
              {PACKAGE_CONFIGS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-300 mb-1">Package Output Directory</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={archiveDirectory}
              onChange={(e) => setArchiveDirectory(e.target.value)}
              placeholder="{project}/Saved/StagedBuilds"
              disabled={!selectedProjectPath}
              className="flex-1 rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleBrowseArchiveDir}
              disabled={!selectedProjectPath}
              className="rounded px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium transition-colors"
            >
              Browse
            </button>
          </div>
        </div>

        {hasBlockingProcesses && (
          <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <p className="font-medium">Cannot run: Unreal Engine is running</p>
            <p className="mt-1 text-amber-200/90">
              {blockingProcesses.map((p) => p.displayName).join(', ')} — close it before running
              Cook, Package, or Build.
            </p>
          </div>
        )}

        {selectedProject && !selectedProject.isCpp && (
          <p className="text-sm text-amber-400/90">
            Build is disabled: this project has no C++ code (no Source folder). Cook and Package
            are available.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runCook}
            disabled={!canRun}
            className="rounded px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
          >
            Cook
          </button>
          <button
            type="button"
            onClick={runPackage}
            disabled={!canRun}
            className="rounded px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
          >
            Package
          </button>
          <button
            type="button"
            onClick={runBuild}
            disabled={!canBuild}
            className="rounded px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium transition-colors"
          >
            Build
          </button>
        </div>
      </div>
    </ToolGroup>
  );
}
