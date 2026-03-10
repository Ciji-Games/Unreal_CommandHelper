/**
 * Hook for scheduled jobs persistence - load, add, update, remove jobs from store.
 */

import { useState, useEffect, useCallback } from 'react';
import type { ScheduledJob } from '../types';
import { getStore } from './useStore';
import { STORE_KEYS } from '../config';

function generateId(): string {
  return crypto.randomUUID();
}

export function useScheduledJobs() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const store = await getStore();
      const stored = await store.get<ScheduledJob[]>(STORE_KEYS.SCHEDULED_JOBS);
      setJobs(stored ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const addJob = useCallback(async (job: Omit<ScheduledJob, 'id'>) => {
    const store = await getStore();
    const current = (await store.get<ScheduledJob[]>(STORE_KEYS.SCHEDULED_JOBS)) ?? [];
    const newJob: ScheduledJob = { ...job, id: generateId() };
    const updated = [...current, newJob];
    await store.set(STORE_KEYS.SCHEDULED_JOBS, updated);
    setJobs(updated);
    return newJob;
  }, []);

  const updateJob = useCallback(async (id: string, updates: Partial<ScheduledJob>) => {
    const store = await getStore();
    const current = (await store.get<ScheduledJob[]>(STORE_KEYS.SCHEDULED_JOBS)) ?? [];
    const updated = current.map((j) => (j.id === id ? { ...j, ...updates } : j));
    await store.set(STORE_KEYS.SCHEDULED_JOBS, updated);
    setJobs(updated);
  }, []);

  const removeJob = useCallback(async (id: string) => {
    const store = await getStore();
    const current = (await store.get<ScheduledJob[]>(STORE_KEYS.SCHEDULED_JOBS)) ?? [];
    const updated = current.filter((j) => j.id !== id);
    await store.set(STORE_KEYS.SCHEDULED_JOBS, updated);
    setJobs(updated);
  }, []);

  return {
    jobs,
    loading,
    error,
    addJob,
    updateJob,
    removeJob,
    refresh: loadJobs,
  };
}
