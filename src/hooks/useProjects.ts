/**
 * Hook for projects persistence - load, add, remove projects from store.
 * Mirrors the useProjects pattern from webdev launcher.
 * On load, filters out projects whose paths no longer exist on disk.
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ProjectInfo } from '../types';
import { getStore } from './useStore';
import { STORE_KEYS } from '../config';

export function useProjects() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const store = await getStore();
      const stored = await store.get<ProjectInfo[]>(STORE_KEYS.PROJECTS) ?? [];
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
      const updated = await Promise.all(
        valid.map(async (p) => {
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
      const anyMapsChanged = updated.some((p, i) => p.maps !== valid[i].maps);
      if (anyMapsChanged) {
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

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const addProject = useCallback(async (project: ProjectInfo) => {
    const store = await getStore();
    const current = await store.get<ProjectInfo[]>(STORE_KEYS.PROJECTS) ?? [];
    if (current.some((p) => p.projectPath === project.projectPath)) {
      return; // already exists
    }
    const updated = [...current, project];
    await store.set(STORE_KEYS.PROJECTS, updated);
    setProjects(updated);
  }, []);

  const removeProject = useCallback(async (projectPath: string) => {
    const store = await getStore();
    const current = await store.get<ProjectInfo[]>(STORE_KEYS.PROJECTS) ?? [];
    const updated = current.filter((p) => p.projectPath !== projectPath);
    await store.set(STORE_KEYS.PROJECTS, updated);
    setProjects(updated);
  }, []);

  const updateProject = useCallback(async (projectPath: string, updates: Partial<ProjectInfo>) => {
    const store = await getStore();
    const current = await store.get<ProjectInfo[]>(STORE_KEYS.PROJECTS) ?? [];
    const updated = current.map((p) =>
      p.projectPath === projectPath ? { ...p, ...updates } : p
    );
    await store.set(STORE_KEYS.PROJECTS, updated);
    setProjects(updated);
  }, []);

  return {
    projects,
    loading,
    error,
    addProject,
    removeProject,
    updateProject,
    refresh: loadProjects,
  };
}
