import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { IdeCandidate } from '../types';

interface IdeContextValue {
  candidates: IdeCandidate[];
  loading: boolean;
  error: string | null;
  ensureLoaded: () => Promise<IdeCandidate[]>;
  refresh: () => Promise<IdeCandidate[]>;
  getCandidates: (forceRefresh?: boolean) => Promise<IdeCandidate[]>;
}

const IdeContext = createContext<IdeContextValue | null>(null);

export function IdeProvider({ children }: { children: React.ReactNode }) {
  const [candidates, setCandidates] = useState<IdeCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const inFlightRef = useRef<Promise<IdeCandidate[]> | null>(null);
  const candidatesRef = useRef<IdeCandidate[]>([]);

  const getCandidates = useCallback(async (forceRefresh = false): Promise<IdeCandidate[]> => {
    if (!forceRefresh && loadedRef.current) {
      return candidatesRef.current;
    }

    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const request = (async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextCandidates] = await invoke<[IdeCandidate[], string | null]>('list_installed_ides');
        loadedRef.current = true;
        candidatesRef.current = nextCandidates;
        setCandidates(nextCandidates);
        return nextCandidates;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to detect IDEs';
        setError(message);
        candidatesRef.current = [];
        setCandidates([]);
        return [];
      } finally {
        setLoading(false);
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = request;
    return request;
  }, []);

  const ensureLoaded = useCallback(async () => getCandidates(false), [getCandidates]);
  const refresh = useCallback(async () => getCandidates(true), [getCandidates]);

  return (
    <IdeContext.Provider
      value={{
        candidates,
        loading,
        error,
        ensureLoaded,
        refresh,
        getCandidates,
      }}
    >
      {children}
    </IdeContext.Provider>
  );
}

export function useIdeContext() {
  const ctx = useContext(IdeContext);
  if (!ctx) throw new Error('useIdeContext must be used within IdeProvider');
  return ctx;
}

export default IdeProvider;



