/**
 * Hook for projects persistence - load, add, remove projects from store.
 * Mirrors the useProjects pattern from webdev launcher.
 */

import { useState, useEffect, useCallback } from 'react';
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
      const stored = await store.get<ProjectInfo[]>(STORE_KEYS.PROJECTS);
      setProjects(stored ?? []);
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
