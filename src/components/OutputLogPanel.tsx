/**
 * Output Log panel - scrollable monospace log with colored lines.
 * Progress bar below the log with animated fill and elapsed time.
 *
 * Old launcher coloring:
 * - Green: Success, Completed
 * - Red: Error (also stderr)
 * - Orange: Warning
 * - Blue: Info
 * - White: Default
 */

import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useLog } from '../contexts/LogContext';
import { useProgress } from '../contexts/ProgressContext';

export interface LogEvent {
  line: string;
  color?: 'green' | 'red' | 'orange' | 'blue' | 'white' | 'gray';
}

const colorClasses: Record<string, string> = {
  green: 'text-emerald-400',
  red: 'text-red-400',
  orange: 'text-amber-400',
  blue: 'text-sky-400',
  white: 'text-zinc-200',
  gray: 'text-zinc-500',
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function OutputLogPanel() {
  const { lines, appendLine, clearLog } = useLog();
  const { running, percent, elapsedMs } = useProgress();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlisten = listen<LogEvent>('log-output', (event) => {
      const payload = event.payload;
      appendLine({ line: payload.line, color: payload.color as LogEvent['color'] });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appendLine]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines]);

  const handleClear = () => {
    clearLog();
  };

  return (
    <div className="flex flex-col gap-2 min-h-0 flex-1">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-semibold text-white">Output Log</h3>
        <button
          type="button"
          onClick={handleClear}
          className="rounded px-3 py-1 text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
        >
          Clear
        </button>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto rounded bg-zinc-900 p-3 font-mono text-sm leading-relaxed"
      >
        {lines.length === 0 ? (
          <p className="text-zinc-500 italic">Log output will appear here...</p>
        ) : (
          lines.map((entry, i) => (
            <div
              key={i}
              className={colorClasses[entry.color ?? 'white'] ?? 'text-zinc-200'}
            >
              {entry.line}
            </div>
          ))
        )}
      </div>
      {running && (
        <div className="flex items-center gap-3 shrink-0 -mt-0.5">
          <div className="flex-1 h-3.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-300 relative overflow-hidden progress-bar-fill"
              style={{
                width: `${percent}%`,
              }}
            />
          </div>
          <span className="text-sm text-zinc-400 tabular-nums min-w-[3rem]">
            {formatElapsed(elapsedMs)}
          </span>
        </div>
      )}
    </div>
  );
}
