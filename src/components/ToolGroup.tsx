/**
 * ToolGroup - CustomGroup pattern from UECommandHelper.
 * Step 10: Title, description, amber accent line, children content.
 */

interface ToolGroupProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function ToolGroup({ title, description, children }: ToolGroupProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="font-bold text-white">{title}</h3>
        <div className="flex-1 h-0.5 bg-amber-500" />
      </div>
      <p className="text-zinc-400 text-sm">{description}</p>
      {children}
    </div>
  );
}
