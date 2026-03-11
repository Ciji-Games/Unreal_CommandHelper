/**
 * ToolBox tab - vertical menu + content panel, Output Log.
 * Step 10: Two-column layout with ToolGroup panels. Step 11: UmapHelper.
 */

import { useState } from 'react';
import { RegenerateProjectPanel } from './RegenerateProjectPanel';
import { UmapHelperPanel } from './UmapHelperPanel';
import { ShaderBoosterPanel } from './ShaderBoosterPanel';
import { PluginHelperPanel } from './PluginHelperPanel';
import { UProjectHelperPanel } from './UProjectHelperPanel';
import { BatchCommitPanel } from './BatchCommitPanel';
import { OutputLogPanel } from './OutputLogPanel';

const TOOLS = [
  { id: 'shader', label: 'Shader Booster', panel: ShaderBoosterPanel },
  { id: 'regenerate', label: 'Regenerate Project', panel: RegenerateProjectPanel },
  { id: 'batchcommit', label: 'Batch Commit', panel: BatchCommitPanel },
  { id: 'umap', label: 'UMap Helper', panel: UmapHelperPanel },
  { id: 'plugin', label: 'Plugin Helper', panel: PluginHelperPanel },
  { id: 'uproject', label: 'UProject Helper', panel: UProjectHelperPanel },
] as const;

type ToolId = (typeof TOOLS)[number]['id'];

export function ToolBoxTab() {
  const [selectedToolId, setSelectedToolId] = useState<ToolId>('regenerate');

  const SelectedPanel = TOOLS.find((t) => t.id === selectedToolId)?.panel ?? RegenerateProjectPanel;

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {/* Tool area - fixed 60% of vertical space for stable layout when switching tools */}
      <div className="flex gap-4 flex-[6_1_0] min-h-0 overflow-hidden">
        {/* Left: Vertical menu */}
        <div className="w-44 shrink-0 flex flex-col">
          <nav className="flex flex-col gap-0.5 rounded-lg overflow-hidden bg-zinc-900/80 border border-zinc-800">
            {TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => setSelectedToolId(tool.id)}
                className={`px-4 py-3 text-left text-sm font-medium transition-colors ${
                  selectedToolId === tool.id
                    ? 'bg-amber-600 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
              >
                {tool.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Right: Content panel */}
        <div className="flex-1 min-w-0 min-h-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 overflow-y-auto">
          <SelectedPanel />
        </div>
      </div>

      {/* Output Log - fixed 40% of vertical space for stable layout when switching tools */}
      <div className="flex-[4_1_0] min-h-0 flex flex-col min-w-0 overflow-hidden">
        <OutputLogPanel />
      </div>
    </div>
  );
}
