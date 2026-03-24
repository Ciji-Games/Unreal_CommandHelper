/**
 * Log context - shared log state for Output Log panel.
 * Allows RegenerateProjectPanel and other tools to clear the log before running.
 * Throttles rapid appendLine calls to avoid UI freeze when many events arrive (e.g. batch commit).
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { LogEvent } from '../components/OutputLogPanel';

interface LogContextValue {
  lines: LogEvent[];
  appendLine: (event: LogEvent) => void;
  clearLog: () => void;
}

const LogContext = createContext<LogContextValue | null>(null);

const FLUSH_INTERVAL_MS = 50; // Throttle to ~20 updates/sec to keep UI responsive
const MAX_FLUSH_BATCH = 25; // Limit lines per flush to avoid freeze when tabbing back with large backlog
const MAX_LOG_LINES = 3000; // Hard cap to keep memory/render cost bounded

export function LogProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<LogEvent[]>([]);
  const bufferRef = useRef<LogEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushRef = useRef<() => void>(() => {});

  const flush = useCallback(() => {
    if (bufferRef.current.length === 0) return;
    const toAdd = bufferRef.current.splice(0, MAX_FLUSH_BATCH);
    setLines((prev) => {
      const next = [...prev, ...toAdd];
      if (next.length <= MAX_LOG_LINES) return next;
      return next.slice(next.length - MAX_LOG_LINES);
    });
    if (bufferRef.current.length > 0) {
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushRef.current();
      }, FLUSH_INTERVAL_MS);
    }
  }, []);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const appendLine = useCallback(
    (event: LogEvent) => {
      bufferRef.current.push(event);
      if (flushTimerRef.current === null) {
        flushTimerRef.current = setTimeout(() => {
          flushTimerRef.current = null;
          flushRef.current();
        }, FLUSH_INTERVAL_MS);
      }
    },
    [flush]
  );

  const clearLog = useCallback(() => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    bufferRef.current = [];
    setLines([]);
  }, []);

  return (
    <LogContext.Provider value={{ lines, appendLine, clearLog }}>
      {children}
    </LogContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLog() {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error('useLog must be used within LogProvider');
  return ctx;
}
