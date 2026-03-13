/**
 * Hook for projects persistence - load, add, remove projects from store.
 * Uses ProjectsContext so project scan runs only once at app startup.
 */

import { useProjectsContext } from '../contexts/ProjectsContext';

export function useProjects() {
  return useProjectsContext();
}
