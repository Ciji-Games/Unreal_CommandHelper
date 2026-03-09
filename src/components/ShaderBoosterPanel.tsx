/**
 * Shader Booster panel - placeholder until Step 12.
 * Step 10: ToolGroup with coming soon message.
 */

import { ToolGroup } from './ToolGroup';

export function ShaderBoosterPanel() {
  return (
    <ToolGroup
      title="Shader Booster"
      description="Check for the CPU priority of the ShaderCompileWorker.exe and set it to the desired priority."
    >
      <p className="text-zinc-500 italic">Coming in Step 12</p>
    </ToolGroup>
  );
}
