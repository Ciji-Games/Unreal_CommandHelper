/**
 * Shader Booster panel - Step 12.
 * Check ShaderCompileWorker.exe priority and set it to the desired level.
 * Auto-switch applies the selected priority when the worker starts.
 */

import { ToolGroup } from './ToolGroup';
import { Select } from './Select';
import { useShaderBooster } from '../hooks/useShaderBooster';
import { useSettings } from '../hooks/useSettings';

const PRIORITY_OPTIONS = [
  { value: 0, label: 'Below Normal' },
  { value: 1, label: 'Normal' },
  { value: 2, label: 'Above Normal' },
  { value: 3, label: 'High' },
] as const;

export function ShaderBoosterPanel() {
  const { status, error, setPriority } = useShaderBooster();
  const { settings, setSetting } = useSettings();

  const handleBoost = () => {
    setPriority(String(settings.priorityBooster));
  };

  const handleReset = () => {
    setPriority('0'); // BelowNormal
    setSetting('autoSwitchBooster', false);
  };

  const statusText = status.running
    ? `Running (${status.priority ?? 'Unknown'})`
    : 'Not running';
  const statusColor = status.running ? 'text-lime-400' : 'text-red-400';

  return (
    <ToolGroup
      title="Shader Booster"
      description="Check for the CPU priority of the ShaderCompileWorker.exe and set it to the desired priority."
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-300">Current status:</span>
          <span className={`font-medium ${statusColor}`}>{statusText}</span>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-6">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Desired priority</label>
            <Select
              value={String(settings.priorityBooster)}
              onChange={(v) => setSetting('priorityBooster', Number(v))}
              options={PRIORITY_OPTIONS.map((opt) => ({ value: String(opt.value), label: opt.label }))}
              className="min-w-[10rem]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-300">Auto-switch</label>
            <button
              type="button"
              role="switch"
              aria-checked={settings.autoSwitchBooster}
              onClick={() => setSetting('autoSwitchBooster', !settings.autoSwitchBooster)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                settings.autoSwitchBooster ? 'bg-sky-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                  settings.autoSwitchBooster ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleBoost}
            disabled={!status.running}
            className="rounded-md px-4 py-2 bg-sky-600/80 hover:bg-sky-500/80 disabled:bg-slate-600 disabled:text-slate-500 text-white font-medium transition-colors"
          >
            Boost priority
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={!status.running}
            className="rounded-md px-4 py-2 bg-slate-600/80 hover:bg-slate-500/80 disabled:bg-slate-700 disabled:text-slate-500 text-slate-200 font-medium transition-colors"
          >
            Reset priority
          </button>
        </div>

        <p className="text-xs text-slate-500">
          When Auto-switch is on, the selected priority is applied automatically every 2 seconds
          while ShaderCompileWorker is running.
        </p>
      </div>
    </ToolGroup>
  );
}
