/**
 * Projects context - shared project state loaded once at app startup.
 * Prevents re-scanning when switching tabs (LauncherTab unmounts/remounts).
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ProjectInfo } from '../types';
import { getStore } from '../hooks/useStore';
import { STORE_KEYS } from '../config';

interface ProjectsContextValue {
  projects: ProjectInfo[];
  loading: boolean;
  error: string | null;
  addProject: (project: ProjectInfo) => Promise<void>;
  removeProject: (projectPath: string) => Promise<void>;
  updateProject: (projectPath: string, updates: Partial<ProjectInfo>) => Promise<void>;
  refresh: () => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const store = await getStore();
      const stored = (await store.get<ProjectInfo[]>(STORE_KEYS.PROJECTS)) ?? [];
      if (stored.length === 0) {
        setProjects([]);
        return;
      }
      const paths = stored.map((p) => p.projectPath);
      const existingPaths = await invoke<string[]>('filter_existing_paths', { paths });
      const existingSet = new Set(existingPaths);
      const valid = stored.filter((p) => existingSet.has(p.projectPath));
      if (valid.length < stored.length) {
        await store.set(STORE_KEYS.PROJECTS, valid);
      }
      // Re-validate engine paths: if engine no longer exists on disk, re-analyse project
      const enginePathsToCheck = valid
        .filter((p) => p.engineInstallPath && p.engineInstallPath !== 'Unknown')
        .map((p) => p.engineInstallPath);
      const existingEnginePaths =
        enginePathsToCheck.length > 0
          ? await invoke<string[]>('filter_existing_paths', { paths: enginePathsToCheck })
          : [];
      const existingEngineSet = new Set(existingEnginePaths);
      const withValidEngines = await Promise.all(
        valid.map(async (p) => {
          if (
            p.engineInstallPath &&
            p.engineInstallPath !== 'Unknown' &&
            !existingEngineSet.has(p.engineInstallPath)
          ) {
            try {
              const fresh = await invoke<ProjectInfo>('analyse_uproject', {
                path: p.projectPath,
              });
              return fresh;
            } catch {
              return { ...p, engineInstallPath: 'Unknown' };
            }
          }
          return p;
        })
      );
      const updated = await Promise.all(
        withValidEngines.map(async (p) => {
          try {
            const freshMaps = await invoke<string[]>('scan_project_maps', {
              projectPath: p.projectPath,
            });
            const mapsChanged =
              freshMaps.length !== p.maps.length ||
              freshMaps.some((m, i) => m !== p.maps[i]);
            if (mapsChanged) {
              return { ...p, maps: freshMaps };
            }
          } catch {
            // keep existing maps on scan failure
          }
          return p;
        })
      );
      const anyMapsChanged = updated.some((p, i) => p.maps !== withValidEngines[i].maps);
      const anyEngineChanged = withValidEngines.some(
        (p, i) =>
          p.engineInstallPath !== valid[i].engineInstallPath ||
          p.engineVersion !== valid[i].engineVersion
      );
      if (anyMapsChanged || anyEngineChanged) {
        await store.set(STORE_KEYS.PROJECTS, updated);
      }
      setProjects(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load projects once when app starts (provider mounts and never unmounts)
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const addProject = useCallback(async (project: ProjectInfo) => {
    const store = await getStore();
    const current = (await store.get<ProjectInfo[]>(STORE_KEYS.PROJECTS)) ?? [];
    if (current.some((p) => p.projectPath === project.projectPath)) {
      return;
    }
    const updated = [...current, project];
    await store.set(STORE_KEYS.PROJECTS, updated);
    setProjects(updated);
  }, []);

  const removeProject = useCallback(async (projectPath: string) => {
    const store = await getStore();
    const current = (await store.get<ProjectInfo[]>(STORE_KEYS.PROJECTS)) ?? [];
    const updated = current.filter((p) => p.projectPath !== projectPath);
    await store.set(STORE_KEYS.PROJECTS, updated);
    setProjects(updated);
  }, []);

  const updateProject = useCallback(
    async (projectPath: string, updates: Partial<ProjectInfo>) => {
      const store = await getStore();
      const current = (await store.get<ProjectInfo[]>(STORE_KEYS.PROJECTS)) ?? [];
      const updated = current.map((p) =>
        p.projectPath === projectPath ? { ...p, ...updates } : p
      );
      await store.set(STORE_KEYS.PROJECTS, updated);
      setProjects(updated);
    },
    []
  );

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        loading,
        error,
        addProject,
        removeProject,
        updateProject,
        refresh: loadProjects,
      }}
    >
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjectsContext() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjectsContext must be used within ProjectsProvider');
  return ctx;
}
