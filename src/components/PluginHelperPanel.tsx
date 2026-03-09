/**
 * Plugin Helper panel - placeholder until Step 13.
 * Step 10: ToolGroup with coming soon message.
 */

import { ToolGroup } from './ToolGroup';

export function PluginHelperPanel() {
  return (
    <ToolGroup
      title="Plugin Helper"
      description="Purpose: Builds and zips a plugin."
    >
      <p className="text-zinc-500 italic">Coming soon</p>
    </ToolGroup>
  );
}
