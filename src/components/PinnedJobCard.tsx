/**
 * PinnedJobCard - Compact card for pinned scheduler jobs in the launcher.
 * Same layout as engine cards: name + Play button.
 */

import type { ScheduledJob } from '../types';

interface PinnedJobCardProps {
  job: ScheduledJob;
  onRun: (job: ScheduledJob) => void;
  disabled?: boolean;
}

export function PinnedJobCard({ job, onRun, disabled }: PinnedJobCardProps) {
  return (
    <div className="flex flex-col rounded-lg border border-zinc-700 bg-zinc-900/80 w-36 shrink-0">
      <div className="p-3 space-y-2">
        <h3 className="font-semibold text-white truncate text-sm text-center" title={job.name}>
          {job.name}
        </h3>
        <button
          type="button"
          onClick={() => onRun(job)}
          disabled={disabled}
          className="w-full px-2 py-1.5 text-xs font-medium rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-600"
          title={`Run ${job.name}`}
        >
          Run job
        </button>
      </div>
    </div>
  );
}
