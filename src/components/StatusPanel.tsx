/**
 * Status panel - verifies Step 4 (persistence) and Step 5 (registry) integration.
 * Shows engine count, UnrealVersionSelector path, and projects count.
 */

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useProjects } from '../hooks/useProjects';
import type { EngineEntry } from '../types';

export function StatusPanel() {
  const { projects } = useProjects();
  const [versionSelectorPath, setVersionSelectorPath] = useState<string | null>(null);
  const [engines, setEngines] = useState<EngineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      invoke<string | null>('get_unreal_version_selector_path'),
      invoke<EngineEntry[]>('get_installed_engine_paths'),
    ])
      .then(([path, enginePaths]) => {
        setVersionSelectorPath(path ?? null);
        setEngines(enginePaths ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <p className="text-zinc-500 text-sm">Loading registry...</p>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 space-y-2 text-sm">
      <h3 className="font-semibold text-amber-500">Status (Step 4 & 5)</h3>
      <div className="space-y-1 text-zinc-400">
        <p>
          <span className="text-zinc-500">Engines:</span>{' '}
          <span className="text-white">{engines.length}</span>
          {engines.length > 0 && (
            <span className="text-zinc-500 ml-2">
              ({engines.map((e) => e.version).join(', ')})
            </span>
          )}
        </p>
        <p>
          <span className="text-zinc-500">UnrealVersionSelector:</span>{' '}
          <span className={versionSelectorPath ? 'text-green-400' : 'text-amber-500'}>
            {versionSelectorPath || 'Not found'}
          </span>
        </p>
        <p>
          <span className="text-zinc-500">Projects (stored):</span>{' '}
          <span className="text-white">{projects.length}</span>
        </p>
      </div>
    </div>
  );
}
