/**
 * Step param panel for map commands with extra params: Resave Actors, Foliage Builder,
 * Navigation Data Builder, Rename/Duplicate Map.
 * Params: project, map, launchMapAfter, plus step-specific (actorClass, newGridSize, newPackage, rename)
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../../hooks/useProjects';
import type { ProjectInfo } from '../../types';
import { getProjectDisplayLabel } from '../../utils/project';
import { Select } from '../Select';

const MAP_STEP_IDS = ['resave_actors', 'foliage_builder', 'navigation_data', 'rename_duplicate'] as const;
type MapStepId = (typeof MAP_STEP_IDS)[number];

interface StepParamPanelMapExtendedProps {
  stepId: MapStepId;
  value: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}

export function StepParamPanelMapExtended({ stepId, value, onChange }: StepParamPanelMapExtendedProps) {
  const { projects, addProject } = useProjects();
  const projectPath = (value.project as string) ?? '';
  const mapPath = (value.map as string) ?? '';
  const launchMapAfter = (value.launchMapAfter as boolean) ?? false;
  const actorClass = (value.actorClass as string) ?? '';
  const newGridSize = (value.newGridSize as number) ?? 512;
  const newPackage = (value.newPackage as string) ?? '/Game/Maps/NewPackage';
  const rename = (value.rename as boolean) ?? false;

  const selectedProject = projects.find((p) => p.projectPath === projectPath);
  const maps = selectedProject?.maps ?? [];

  const handleProjectChange = async (v: string) => {
    if (v === '__browse__') {
      const path = await open({
        directory: false,
        filters: [{ name: 'Unreal Project', extensions: ['uproject'] }],
      });
      if (path && typeof path === 'string') {
        try {
          const project = await invoke<ProjectInfo>('analyse_uproject', { path });
          await addProject(project);
          onChange({ ...value, project: project.projectPath, map: '' });
        } catch (e) {
          console.error('Failed to analyse project:', e);
        }
      }
    } else {
      onChange({ ...value, project: v, map: maps.includes(mapPath) ? mapPath : '' });
    }
  };

  const mapDisplayName = (mp: string) => mp.split(/[/\\]/).pop() || mp;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-sm text-slate-300 mb-1">Project</label>
        <Select
          value={projectPath}
          onChange={(v) => handleProjectChange(v)}
          placeholder={projects.length === 0 ? 'No projects' : 'Select project'}
          options={[
            ...projects.map((p) => ({ value: p.projectPath, label: getProjectDisplayLabel(p) })),
            { value: '__browse__', label: 'Browse...' },
          ]}
        />
      </div>
      <div>
        <label className="block text-sm text-slate-300 mb-1">Map</label>
        <Select
          value={mapPath}
          onChange={(v) => onChange({ ...value, map: v })}
          placeholder="Select map"
          disabled={!projectPath || maps.length === 0}
          options={maps.map((mp) => ({ value: mp, label: mapDisplayName(mp) }))}
        />
      </div>
      {stepId === 'resave_actors' && (
        <div>
          <label className="block text-sm text-slate-300 mb-1">Actor class (optional)</label>
          <input
            type="text"
            value={actorClass}
            onChange={(e) => onChange({ ...value, actorClass: e.target.value })}
            placeholder="e.g. StaticMeshActor"
            className="w-full rounded-md bg-slate-700/50 border border-slate-600 text-slate-100 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
          />
        </div>
      )}
      {stepId === 'foliage_builder' && (
        <div>
          <label className="block text-sm text-slate-300 mb-1">Grid size</label>
          <input
            type="number"
            value={newGridSize}
            onChange={(e) => onChange({ ...value, newGridSize: parseInt(e.target.value, 10) || 512 })}
            min={64}
            max={4096}
            className="w-24 rounded-md bg-slate-700/50 border border-slate-600 text-slate-100 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
          />
        </div>
      )}
      {stepId === 'rename_duplicate' && (
        <>
          <div>
            <label className="block text-sm text-slate-300 mb-1">New package path</label>
            <input
              type="text"
              value={newPackage}
              onChange={(e) => onChange({ ...value, newPackage: e.target.value })}
              placeholder="/Game/Maps/NewPackage"
              className="w-full rounded-md bg-slate-700/50 border border-slate-600 text-slate-100 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
            />
          </div>
          <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={rename}
              onChange={(e) => onChange({ ...value, rename: e.target.checked })}
              className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
            />
            Rename (instead of duplicate)
          </label>
        </>
      )}
      <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={launchMapAfter}
          onChange={(e) => onChange({ ...value, launchMapAfter: e.target.checked })}
          className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500/50"
        />
        Launch map after completion
      </label>
    </div>
  );
}
