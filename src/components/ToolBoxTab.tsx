/**
 * ToolBox tab - Regenerate Project, Output Log, and other tools.
 * Step 8 & 9: Minimal layout; Step 10 will add vertical menu + more panels.
 */

import { RegenerateProjectPanel } from './RegenerateProjectPanel';
import { OutputLogPanel } from './OutputLogPanel';

export function ToolBoxTab() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">ToolBox</h1>
        <p className="text-zinc-400 text-sm">
          Regenerate project files, HLOD, shader booster, and more
        </p>
      </div>

      <RegenerateProjectPanel />
      <OutputLogPanel />
    </div>
  );
}
