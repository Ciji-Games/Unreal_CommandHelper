/**
 * Add Project button - last element of the project list. Opens file dialog for .uproject.
 * Mirrors NewProject button from ProjectList.cs.
 */

interface AddProjectButtonProps {
  onAdd: (projectPath: string) => void;
}

export function AddProjectButton({ onAdd }: AddProjectButtonProps) {
  const handleClick = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Unreal Project', extensions: ['uproject'] }],
    });
    if (path && typeof path === 'string') {
      onAdd(path);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex flex-col items-center justify-center w-36 h-36 rounded-lg border-2 border-dashed border-slate-600/60 hover:border-sky-500/50 hover:bg-slate-800/40 text-slate-500 hover:text-sky-400 transition-all shrink-0"
      title="Browse for a new project and add it to the list"
      aria-label="Add new project"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      <span className="mt-2 text-sm font-medium">Add Project</span>
    </button>
  );
}
