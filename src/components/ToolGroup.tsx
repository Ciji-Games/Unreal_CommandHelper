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
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="font-semibold text-slate-100">{title}</h3>
        <div className="flex-1 h-px bg-slate-600/60" />
      </div>
      <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
      {children}
    </div>
  );
}
