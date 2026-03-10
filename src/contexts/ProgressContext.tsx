/**
 * Progress context - shared progress state for the progress bar below the output log.
 * Tools call startProgress() before invoke and finishProgress() in finally.
 * Scheduler uses startProgressForScheduler() for multi-step progress bars.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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

export interface StepProgress {
  totalSteps: number;
  currentStep: number;
  stepPercents: number[];
  stepLabels: string[];
}

interface ProgressContextValue {
  running: boolean;
  percent: number;
  elapsedMs: number;
  stepProgress: StepProgress | null;
  startProgress: () => void;
  finishProgress: () => void;
  startProgressForScheduler: (totalSteps: number, stepLabels: string[]) => void;
  setCurrentStep: (index: number) => void;
  /** Call when user presses Stop. Scheduler checks this to cancel remaining steps. */
  requestStop: () => void;
  /** Ref checked by scheduler loop - true when user requested stop. */
  stopRequestedRef: React.MutableRefObject<boolean>;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [running, setRunning] = useState(false);
  const [percent, setPercent] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [stepProgress, setStepProgress] = useState<StepProgress | null>(null);
  const stopRequestedRef = useRef(false);

  const requestStop = useCallback(() => {
    stopRequestedRef.current = true;
  }, []);

  const startProgress = useCallback(() => {
    stopRequestedRef.current = false;
    setRunning(true);
    setPercent(0);
    setElapsedMs(0);
    setStartTime(Date.now());
    setStepProgress(null);
  }, []);

  const startProgressForScheduler = useCallback(
    (totalSteps: number, stepLabels: string[]) => {
      stopRequestedRef.current = false;
      setRunning(true);
      setPercent(0);
      setElapsedMs(0);
      setStartTime(Date.now());
      setStepProgress({
        totalSteps,
        currentStep: 0,
        stepPercents: Array(totalSteps).fill(0),
        stepLabels,
      });
    },
    []
  );

  const setCurrentStep = useCallback((index: number) => {
    setStepProgress((prev) => {
      if (!prev) return prev;
      const next = { ...prev, stepPercents: [...prev.stepPercents] };
      if (prev.currentStep < prev.totalSteps) {
        next.stepPercents[prev.currentStep] = 100;
      }
      next.currentStep = index;
      return next;
    });
  }, []);

  const finishProgress = useCallback(() => {
    setStepProgress((prev) => {
      if (prev) {
        const final = [...prev.stepPercents];
        if (prev.currentStep < prev.totalSteps) {
          final[prev.currentStep] = 100;
        }
        return { ...prev, stepPercents: final };
      }
      return prev;
    });
    setPercent(100);
    setRunning(false);
  }, []);

  useEffect(() => {
    const unlisten = listen<ProgressUpdate>('progress-update', (event) => {
      const payload = event.payload;
      setStepProgress((prev) => {
        if (prev && prev.currentStep < prev.totalSteps) {
          const next = { ...prev, stepPercents: [...prev.stepPercents] };
          next.stepPercents[prev.currentStep] = payload.percent;
          return next;
        }
        return prev;
      });
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
        stepProgress,
        startProgress,
        finishProgress,
        startProgressForScheduler,
        setCurrentStep,
        requestStop,
        stopRequestedRef,
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
