/**
 * LauncherCard - Project or Engine card.
 * Projects: Full card with thumbnail, name, version, Launch/Delete buttons, map dropdown.
 * Engines: Compact card without thumbnail (name + Launch button).
 * Mirrors LauncherBtn from UECommandHelper.
 */

import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ASSETS } from '../config/assets';
import type { ProjectInfo } from '../types';

const LAUNCH_COOLDOWN_MS = 5000;

function mapDisplayName(mapPath: string): string {
  return mapPath.split(/[/\\]/).pop() || mapPath;
}

interface LauncherCardProps {
  project: ProjectInfo;
  isEngine?: boolean;
  onRemove?: (projectPath: string) => void;
}

export function LauncherCard({ project, isEngine = false, onRemove }: LauncherCardProps) {
  const [thumbnailSrc, setThumbnailSrc] = useState<string>(ASSETS.ueIcon);
  const [launchDisabled, setLaunchDisabled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

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

  const handleLaunchWithMap = async (mapPath: string) => {
    if (launchDisabled) return;
    const enginePath = project.engineInstallPath;
    if (!enginePath || enginePath === 'Unknown') {
      console.error('Engine path not found for this project');
      return;
    }
    setDropdownOpen(false);
    try {
      startLaunchCooldown();
      await invoke('launch_project_with_map', {
        projectPath: project.projectPath,
        mapPath,
        enginePath,
      });
    } catch (e) {
      console.error('Failed to launch with map:', e);
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

  /* Compact engine card: no thumbnail, horizontal layout */
  if (isEngine) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 shrink-0">
        <h3 className="font-semibold text-white truncate text-sm" title={project.projectName}>
          {project.projectName}
        </h3>
        <button
          type="button"
          onClick={handleLaunchProject}
          disabled={launchDisabled}
          className="ml-auto shrink-0 p-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-600"
          title="Launch Unreal Engine"
          aria-label="Launch"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-lg border border-zinc-700 bg-zinc-900/80 w-36 shrink-0">
      {/* Card header: square thumbnail (1:1) + overlays */}
      <div className="relative aspect-square bg-zinc-800 flex items-center justify-center overflow-hidden">
        <img
          src={thumbnailSrc}
          alt={project.projectName}
          className="w-full h-full object-contain"
        />
        {/* Top left: trash icon (when deletable) */}
        {onRemove && (
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
        {project.isCpp && (
          <span className="absolute top-1 right-1 p-1 rounded bg-zinc-900/80" title="C++ project">
            <img src={ASSETS.cppLogo} alt="C++" className="w-4 h-4" />
          </span>
        )}
        {/* Bottom right: short engine version */}
        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-xs font-medium text-zinc-300 bg-zinc-900/90">
          {project.engineVersion}
        </span>
      </div>

      <div className="p-3 space-y-2">
        <h3 className="font-semibold text-white truncate text-sm text-center" title={project.projectName}>
          {project.projectName}
        </h3>

        <div className="flex flex-col gap-1">
          {project.maps.length > 0 ? (
            <div className="relative flex" ref={dropdownRef}>
              <button
                type="button"
                onClick={handleLaunchProject}
                disabled={launchDisabled}
                className="flex-1 px-2 py-1.5 text-xs font-medium rounded-l bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-600 border-r border-amber-700"
                title={`Launch ${project.projectName}`}
              >
                {launchDisabled ? 'Launching…' : 'Launch'}
              </button>
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                disabled={launchDisabled}
                className="px-2 py-1.5 rounded-r bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-600"
                title="Launch on a specific map"
                aria-label="Open map selection"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-0.5 z-10 rounded border border-zinc-600 bg-zinc-800 shadow-lg max-h-32 overflow-y-auto">
                  {project.maps.map((mapPath) => (
                    <button
                      key={mapPath}
                      type="button"
                      onClick={() => handleLaunchWithMap(mapPath)}
                      className="w-full px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-amber-600/30 hover:text-white truncate"
                      title={mapPath}
                    >
                      {mapDisplayName(mapPath)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLaunchProject}
              disabled={launchDisabled}
              className="w-full px-2 py-1.5 text-xs font-medium rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-600"
              title={`Launch ${project.projectName}`}
            >
              {launchDisabled ? 'Launching…' : 'Launch'}
            </button>
          )}

          {project.isCpp && (
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
