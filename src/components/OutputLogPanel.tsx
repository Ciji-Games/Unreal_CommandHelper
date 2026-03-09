/**
 * Output Log panel - scrollable monospace log with colored lines.
 * Step 9: Mirrors outputTextBox from Form1.cs, coloring from CustomGroup.cs
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

export function OutputLogPanel() {
  const { lines, appendLine, clearLog } = useLog();
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
    </div>
  );
}
