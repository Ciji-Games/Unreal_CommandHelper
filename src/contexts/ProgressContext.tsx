/**
 * Progress context - shared progress state for the progress bar below the output log.
 * Tools call startProgress() before invoke and finishProgress() in finally.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { listen } from '@tauri-apps/api/event';

interface ProgressUpdate {
  percent: number;
  elapsedMs: number;
  phaseName?: string;
  currentStep?: number;
  totalSteps?: number;
}

interface ProgressContextValue {
  running: boolean;
  percent: number;
  elapsedMs: number;
  startProgress: () => void;
  finishProgress: () => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [running, setRunning] = useState(false);
  const [percent, setPercent] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  const startProgress = useCallback(() => {
    setRunning(true);
    setPercent(0);
    setElapsedMs(0);
    setStartTime(Date.now());
  }, []);

  const finishProgress = useCallback(() => {
    setPercent(100);
    setRunning(false);
  }, []);

  useEffect(() => {
    const unlisten = listen<ProgressUpdate>('progress-update', (event) => {
      const payload = event.payload;
      setPercent(payload.percent);
      if (payload.elapsedMs > 0) {
        setElapsedMs(payload.elapsedMs);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!running || startTime === null) return;
    const interval = setInterval(() => {
      setElapsedMs((prev) => {
        const fromStart = Date.now() - startTime;
        return Math.max(prev, fromStart);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running, startTime]);

  return (
    <ProgressContext.Provider
      value={{
        running,
        percent,
        elapsedMs,
        startProgress,
        finishProgress,
      }}
    >
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used within ProgressProvider');
  return ctx;
}
