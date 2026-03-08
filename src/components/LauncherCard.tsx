/**
 * LauncherCard - Project or Engine card with thumbnail, name, version, Launch/Delete buttons.
 * Mirrors LauncherBtn from UECommandHelper.
 */

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ASSETS } from '../config/assets';
import type { ProjectInfo } from '../types';

const LAUNCH_COOLDOWN_MS = 5000;

interface LauncherCardProps {
  project: ProjectInfo;
  isEngine?: boolean;
  onRemove?: (projectPath: string) => void;
}

export function LauncherCard({ project, isEngine = false, onRemove }: LauncherCardProps) {
  const [thumbnailSrc, setThumbnailSrc] = useState<string>(ASSETS.ueIcon);
  const [launchDisabled, setLaunchDisabled] = useState(false);

  useEffect(() => {
    if (isEngine) {
      setThumbnailSrc(ASSETS.ueIcon);
      return;
    }
    invoke<string | null>('get_project_thumbnail_path', { projectPath: project.projectPath })
      .then((path) => {
        if (path) {
          try {
            setThumbnailSrc(convertFileSrc(path));
          } catch {
            setThumbnailSrc(ASSETS.ueIcon);
          }
        } else {
          setThumbnailSrc(ASSETS.ueIcon);
        }
      })
      .catch(() => setThumbnailSrc(ASSETS.ueIcon));
  }, [project.projectPath, isEngine]);

  const startLaunchCooldown = () => {
    setLaunchDisabled(true);
    setTimeout(() => setLaunchDisabled(false), LAUNCH_COOLDOWN_MS);
  };

  const handleLaunchProject = async () => {
    if (launchDisabled) return;
    try {
      startLaunchCooldown();
      await invoke('open_file', { path: project.projectPath });
    } catch (e) {
      console.error('Failed to launch:', e);
      setLaunchDisabled(false);
    }
  };

  const handleLaunchSln = async () => {
    if (launchDisabled) return;
    const slnPath = project.projectPath.replace(/\.uproject$/i, '.sln');
    try {
      startLaunchCooldown();
      await invoke('open_file', { path: slnPath });
    } catch (e) {
      console.error('Failed to launch .sln:', e);
      setLaunchDisabled(false);
    }
  };

  const handleDelete = () => {
    onRemove?.(project.projectPath);
  };

  return (
    <div className="flex flex-col rounded-lg border border-zinc-700 bg-zinc-900/80 overflow-hidden w-36 shrink-0">
      {/* Card header: square thumbnail (1:1) + overlays */}
      <div className={`relative aspect-square bg-zinc-800 flex items-center justify-center overflow-hidden ${isEngine ? 'p-6' : ''}`}>
        <img
          src={thumbnailSrc}
          alt={project.projectName}
          className="w-full h-full object-contain"
        />
        {/* Top left: trash icon (when deletable) */}
        {!isEngine && onRemove && (
          <button
            type="button"
            onClick={handleDelete}
            className="absolute top-1 left-1 p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-900/80 transition-colors"
            title="Remove this project from the list"
            aria-label="Remove project"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
        {/* Top right: C++ icon (when C++) */}
        {project.isCpp && !isEngine && (
          <span className="absolute top-1 right-1 p-1 rounded bg-zinc-900/80" title="C++ project">
            <img src={ASSETS.cppLogo} alt="C++" className="w-4 h-4" />
          </span>
        )}
        {/* Bottom right: short engine version (project cards only) */}
        {!isEngine && (
          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-xs font-medium text-zinc-300 bg-zinc-900/90">
            {project.engineVersion}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        <h3 className="font-semibold text-white truncate text-sm text-center" title={project.projectName}>
          {project.projectName}
        </h3>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={handleLaunchProject}
            disabled={launchDisabled}
            className="w-full px-2 py-1.5 text-xs font-medium rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-600"
            title={isEngine ? 'Launch Unreal Engine' : `Launch ${project.projectName}`}
          >
            {launchDisabled ? 'Launching…' : isEngine ? 'Launch Engine' : 'Launch'}
          </button>

          {project.isCpp && !isEngine && (
            <button
              type="button"
              onClick={handleLaunchSln}
              disabled={launchDisabled}
              className="w-full px-2 py-1.5 text-xs font-medium rounded bg-zinc-600 hover:bg-zinc-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-zinc-600"
              title="Open the solution"
            >
              Open .sln
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
