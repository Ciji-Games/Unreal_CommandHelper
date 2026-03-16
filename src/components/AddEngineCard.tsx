/**
 * Add Engine card - compact card in Engine Versions section.
 * Opens Settings panel to Engine Management. Matches engine card compact size.
 */

interface AddEngineCardProps {
  onOpenSettings: () => void;
}

export function AddEngineCard({ onOpenSettings }: AddEngineCardProps) {
  return (
    <button
      type="button"
      onClick={onOpenSettings}
      className="flex flex-col items-center justify-center w-36 shrink-0 rounded-lg border-2 border-dashed border-slate-600/60 hover:border-sky-500/50 hover:bg-slate-800/40 text-slate-500 hover:text-sky-400 transition-all p-3"
      title="Add a custom engine (opens Settings)"
      aria-label="Add engine"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      <span className="mt-1.5 text-xs font-medium">Add Engine</span>
    </button>
  );
}
