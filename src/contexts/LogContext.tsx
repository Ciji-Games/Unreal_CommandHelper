/**
 * Log context - shared log state for Output Log panel.
 * Allows RegenerateProjectPanel and other tools to clear the log before running.
 */

import { createContext, useCallback, useContext, useState } from 'react';
import type { LogEvent } from '../components/OutputLogPanel';

interface LogContextValue {
  lines: LogEvent[];
  appendLine: (event: LogEvent) => void;
  clearLog: () => void;
}

const LogContext = createContext<LogContextValue | null>(null);

export function LogProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<LogEvent[]>([]);

  const appendLine = useCallback((event: LogEvent) => {
    setLines((prev) => [...prev, event]);
  }, []);

  const clearLog = useCallback(() => {
    setLines([]);
  }, []);

  return (
    <LogContext.Provider value={{ lines, appendLine, clearLog }}>
      {children}
    </LogContext.Provider>
  );
}

export function useLog() {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error('useLog must be used within LogProvider');
  return ctx;
}
