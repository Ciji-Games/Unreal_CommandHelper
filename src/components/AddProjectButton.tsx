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
      className="flex flex-col items-center justify-center w-36 h-36 rounded-lg border-2 border-dashed border-zinc-600 hover:border-amber-500 hover:bg-zinc-800/50 text-zinc-500 hover:text-amber-500 transition-colors shrink-0"
      title="Browse for a new project and add it to the list"
      aria-label="Add new project"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      <span className="mt-2 text-sm font-medium">Add Project</span>
    </button>
  );
}
