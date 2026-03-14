/**
 * Batch Commit panel - scan uncommitted files, preview groups, batch commit with LFS support.
 * Translates batchcommit.bat and checkLFS.bat.
 */

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../hooks/useProjects';
import { useLog } from '../contexts/LogContext';
import { useProgress } from '../contexts/ProgressContext';
import { ToolGroup } from './ToolGroup';
import { Select } from './Select';
import type { ProjectInfo } from '../types';
import { getProjectDisplayLabel } from '../utils/project';

const TARGET_SIZE_MIN_MB = 100;
const TARGET_SIZE_MAX_MB = 1800; // 1.8 GB
const TARGET_SIZE_DEFAULT_MB = 200;

interface FileEntry {
  path: string;
  size: number;
}

interface LargeFileEntry {
  path: string;
  size: number;
  inLfs: boolean;
  commitMessage?: string;
}

interface ScanResult {
  gitRoot: string;
  smallFiles: FileEntry[];
  groupedCommits: FileEntry[][];
  largeFiles: LargeFileEntry[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ChevronRight = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500">
    <path d="M9 18l6-6-6-6" />
  </svg>
);
const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/** Distribute LFS entries across commit groups to stay within target size. */
function distributeLfsByTargetSize(
  baseGroups: FileEntry[][],
  lfsEntries: FileEntry[],
  targetSizeBytes: number
): FileEntry[][] {
  const result: FileEntry[][] = baseGroups.map((g) => [...g]);
  if (lfsEntries.length === 0) return result;

  let lastIndex = result.length - 1;
  let currentSize =
    lastIndex >= 0 ? result[lastIndex].reduce((s, e) => s + e.size, 0) : 0;

  for (const entry of lfsEntries) {
    const wouldExceed = currentSize + entry.size > targetSizeBytes;
    const hasContent = lastIndex >= 0 && result[lastIndex].length > 0;
    if (wouldExceed && hasContent) {
      result.push([]);
      lastIndex = result.length - 1;
      currentSize = 0;
    }
    if (lastIndex < 0) {
      result.push([entry]);
      lastIndex = 0;
    } else {
      result[lastIndex].push(entry);
    }
    currentSize += entry.size;
  }

  return result;
}

export function BatchCommitPanel() {
  const { projects, addProject } = useProjects();
  const { clearLog } = useLog();
  const { startProgress, finishProgress } = useProgress();
  const [selectedProjectPath, setSelectedProjectPath] = useState<string>('');
  const [commitName, setCommitName] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [addedToLfsSet, setAddedToLfsSet] = useState<Set<string>>(new Set());
  const [removedFromLfsSet, setRemovedFromLfsSet] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [targetSizeMb, setTargetSizeMb] = useState(TARGET_SIZE_DEFAULT_MB);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set([0]));

  const selectedProject = projects.find((p) => p.projectPath === selectedProjectPath);

  const toggleGroup = (i: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleProjectChange = async (value: string) => {
    if (value === '__browse__') {
      setSelectedProjectPath('__browse__');
      const path = await open({
        directory: false,
        filters: [{ name: 'Unreal Project', extensions: ['uproject'] }],
      });
      if (path && typeof path === 'string') {
        try {
          const project = await invoke<ProjectInfo>('analyse_uproject', { path });
          await addProject(project);
          setSelectedProjectPath(project.projectPath);
        } catch (e) {
          console.error('Failed to analyse project:', e);
          setSelectedProjectPath('');
        }
      } else {
        setSelectedProjectPath('');
      }
    } else {
      setSelectedProjectPath(value);
    }
    setScanResult(null);
  };

  const handleScan = async () => {
    const path = selectedProjectPath === '__browse__' ? '' : selectedProjectPath;
    if (!path) {
      alert('Please select a project.');
      return;
    }
    const projectPath = selectedProject?.projectPath ?? path;
    clearLog();
    setRunning(true);
    startProgress();
    try {
      const targetSizeBytes = targetSizeMb * 1024 * 1024;
      const result = await invoke<ScanResult>('scan_batch_commit', {
        projectPath,
        targetSizeBytes,
      });
      setScanResult(result);
      setAddedToLfsSet(new Set());
      setRemovedFromLfsSet(new Set());
      setExpandedGroups(new Set());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Scan failed: ${msg}`);
    } finally {
      setRunning(false);
      finishProgress();
    }
  };

  useEffect(() => {
    const unlistenComplete = listen('batch-commit-complete', async () => {
      setRunning(false);
      finishProgress();
      if (selectedProjectPath && selectedProjectPath !== '__browse__' && scanResult) {
        try {
          const projectPath = selectedProject?.projectPath ?? selectedProjectPath;
          const targetSizeBytes = targetSizeMb * 1024 * 1024;
          const result = await invoke<ScanResult>('scan_batch_commit', {
            projectPath,
            targetSizeBytes,
          });
          setScanResult(result);
          setAddedToLfsSet(new Set());
          setRemovedFromLfsSet(new Set());
        } catch {
          // Ignore re-scan errors
        }
      }
    });
    const unlistenError = listen<string>('batch-commit-error', (event) => {
      setRunning(false);
      finishProgress();
      alert(`Batch commit failed: ${event.payload}`);
    });
    return () => {
      unlistenComplete.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [finishProgress, selectedProjectPath, selectedProject, scanResult, targetSizeMb]);

  const largeFiles = scanResult?.largeFiles ?? [];
  const groupedCommits = scanResult?.groupedCommits ?? [];
  const lfsFileEntries = largeFiles.filter((f) =>
    (f.inLfs || addedToLfsSet.has(f.path)) && !removedFromLfsSet.has(f.path)
  );
  const uncommittedLfsFiles = lfsFileEntries.filter((f) => !f.commitMessage);
  const targetSizeBytes = targetSizeMb * 1024 * 1024;
  const displayGroups = distributeLfsByTargetSize(
    groupedCommits,
    uncommittedLfsFiles,
    targetSizeBytes
  );
  const largeFileSectionIndex = displayGroups.length;

  useEffect(() => {
    if (largeFiles.length > 0 && largeFileSectionIndex >= 0) {
      setExpandedGroups((prev) => {
        if (prev.size === 0) return prev;
        if (prev.has(largeFileSectionIndex)) return prev;
        return new Set(prev).add(largeFileSectionIndex);
      });
    }
  }, [largeFileSectionIndex, largeFiles.length]);

  const effectiveInLfs = (entry: LargeFileEntry) =>
    (entry.inLfs || addedToLfsSet.has(entry.path)) && !removedFromLfsSet.has(entry.path);

  const handleAddToLfs = async (path: string) => {
    const projectPath = selectedProject?.projectPath ?? selectedProjectPath;
    if (!projectPath || projectPath === '__browse__') return;
    try {
      await invoke('add_to_lfs', { projectPath, paths: [path] });
      setAddedToLfsSet((prev) => new Set(prev).add(path));
      setRemovedFromLfsSet((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAddAllToLfs = async () => {
    const projectPath = selectedProject?.projectPath ?? selectedProjectPath;
    if (!projectPath || projectPath === '__browse__') return;
    const toAdd = largeFiles.filter((f) => !effectiveInLfs(f)).map((f) => f.path);
    if (toAdd.length === 0) return;
    try {
      await invoke('add_to_lfs', { projectPath, paths: toAdd });
      setAddedToLfsSet((prev) => new Set([...prev, ...toAdd]));
      setRemovedFromLfsSet((prev) => {
        const next = new Set(prev);
        toAdd.forEach((p) => next.delete(p));
        return next;
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRemoveFromLfs = async (path: string) => {
    const projectPath = selectedProject?.projectPath ?? selectedProjectPath;
    if (!projectPath || projectPath === '__browse__') return;
    try {
      const removed = await invoke<number>('remove_from_lfs', { projectPath, paths: [path] });
      if (removed > 0) {
        setRemovedFromLfsSet((prev) => new Set(prev).add(path));
        setAddedToLfsSet((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      } else {
        alert('Could not remove from LFS. The file may use a glob pattern (e.g. *.uasset) in .gitattributes.');
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const handleBatchCommit = async () => {
    const path = selectedProjectPath === '__browse__' ? '' : selectedProjectPath;
    if (!path || !scanResult || !commitName.trim()) {
      alert('Please select a project, run Scan, and enter a commit name.');
      return;
    }
    const projectPath = selectedProject?.projectPath ?? path;

    clearLog();
    setRunning(true);
    startProgress({ showOutputLog: true });
    const uncommittedLfs = largeFiles.filter((f) => effectiveInLfs(f) && !f.commitMessage);
    const lfsPaths = uncommittedLfs.map((f) => f.path);
    try {
      if (lfsPaths.length > 0) {
        await invoke('add_to_lfs', {
          projectPath,
          paths: lfsPaths,
        });
      }
      const targetSizeBytes = targetSizeMb * 1024 * 1024;
      const distributedGroups = distributeLfsByTargetSize(
        scanResult.groupedCommits,
        uncommittedLfs,
        targetSizeBytes
      );
      const groups = distributedGroups.map((g) => g.map((e) => e.path));
      await invoke('batch_commit', {
        projectPath,
        commitName: commitName.trim(),
        groups,
        lfsPaths,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Batch commit failed: ${msg}`);
      setRunning(false);
      finishProgress();
    }
    // Note: On success, batch_commit runs in background; completion is handled by
    // batch-commit-complete / batch-commit-error event listeners above.
  };

  /** Which commit group index each LFS file will go into (for status display). */
  const getLfsFileCommitIndex = (entry: LargeFileEntry): number | null => {
    if (!effectiveInLfs(entry)) return null;
    const idx = displayGroups.findIndex((g) => g.some((e) => e.path === entry.path));
    return idx >= 0 ? idx : null;
  };

  const hasCommits = displayGroups.length > 0;
  const hasContent =
    groupedCommits.length > 0 || largeFiles.length > 0;

  return (
    <ToolGroup
      title="Batch Commit"
      description="Scan uncommitted files, preview commit groups, and batch commit. Large files (≥99MB) can be added to LFS before committing."
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-sm text-slate-300 mb-1">Project</label>
          <Select
            value={selectedProjectPath}
            onChange={(v) => handleProjectChange(v)}
            placeholder={projects.length === 0 ? 'No projects available' : 'Select a project'}
            options={[
              ...projects.map((p) => ({ value: p.projectPath, label: getProjectDisplayLabel(p) })),
              { value: '__browse__', label: 'Browse new project...' },
            ]}
          />
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-1">
            Group target size: {targetSizeMb} MB
          </label>
          <input
            type="range"
            min={TARGET_SIZE_MIN_MB}
            max={TARGET_SIZE_MAX_MB}
            step={50}
            value={targetSizeMb}
            onChange={(e) => {
              setTargetSizeMb(Number(e.target.value));
              setScanResult(null);
            }}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-sky-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            Best-effort target per commit group (100 MB – 1.8 GB)
          </p>
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-1">Commit name</label>
          <input
            type="text"
            value={commitName}
            onChange={(e) => setCommitName(e.target.value)}
            placeholder="e.g. My changes"
            className="w-full rounded-md bg-slate-700/50 border border-slate-600 text-slate-100 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/30 placeholder:text-slate-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            Commits will be named: {commitName || 'name'}_1, {commitName || 'name'}_2, ...
          </p>
        </div>

        <button
          type="button"
          onClick={handleScan}
          disabled={!selectedProjectPath || selectedProjectPath === '__browse__' || running}
          className="rounded-md px-4 py-2 bg-sky-600/80 hover:bg-sky-500/80 disabled:bg-slate-600 disabled:text-slate-500 text-white font-medium transition-colors w-fit"
        >
          {running ? 'Scanning...' : 'Scan'}
        </button>

        {scanResult && (
          <>
            <div className="rounded-lg border border-slate-600/60 bg-slate-700/30 overflow-hidden">
              <div className="divide-y divide-slate-600/60">
                {!hasContent ? (
                  <div className="p-4">
                    <p className="text-sm text-slate-500">No uncommitted or unstaged files found.</p>
                  </div>
                ) : (
                  <>
                    {displayGroups.map((group, i) => {
                      const totalSize = group.reduce((s, e) => s + e.size, 0);
                      const isExpanded = expandedGroups.has(i);
                      return (
                        <div key={i} className="bg-slate-700/20">
                          <button
                            type="button"
                            onClick={() => toggleGroup(i)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-700/40 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {isExpanded ? <ChevronDown /> : <ChevronRight />}
                              <span className="font-medium text-sky-400/95">
                                {commitName || 'name'}_{i + 1}
                              </span>
                              <span className="text-slate-500 text-sm shrink-0">
                                {formatSize(totalSize)} · {group.length} files
                              </span>
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="px-4 pb-3 pt-0 border-t border-slate-600/60">
                              <div className="max-h-56 overflow-y-auto text-sm space-y-0.5">
                                {group.map((entry) => (
                                  <div
                                    key={entry.path}
                                    className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-slate-700/30"
                                    title={entry.path}
                                  >
                                    <span className="truncate flex-1 min-w-0 text-slate-300">
                                      {entry.path.split(/[/\\]/).pop() ?? entry.path}
                                    </span>
                                    <span className="text-slate-500 text-xs shrink-0">
                                      {formatSize(entry.size)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {largeFiles.length > 0 && (
                      <div className="bg-slate-700/20">
                        <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-700/40">
                          <button
                            type="button"
                            onClick={() => toggleGroup(largeFileSectionIndex)}
                            className="flex items-center gap-3 min-w-0 flex-1 text-left"
                          >
                            {expandedGroups.has(largeFileSectionIndex) ? <ChevronDown /> : <ChevronRight />}
                            <span className="font-medium text-sky-400/95">
                              Large files
                            </span>
                            <span className="text-slate-500 text-sm shrink-0">
                              {formatSize(largeFiles.reduce((s, e) => s + e.size, 0))} ·{' '}
                              {largeFiles.length} files
                            </span>
                            <span className="text-sm shrink-0">
                              <span className="text-green-400">
                                {largeFiles.filter((f) => f.commitMessage).length} committed
                              </span>
                              {' — '}
                              <span className="text-red-400">
                                {largeFiles.filter((f) => !effectiveInLfs(f)).length} NOT committed
                              </span>
                            </span>
                          </button>
                          {largeFiles.some((f) => !effectiveInLfs(f)) && (
                            <button
                              type="button"
                              onClick={handleAddAllToLfs}
                              className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-sky-600/80 text-white hover:bg-sky-500/80"
                            >
                              Add all to LFS
                            </button>
                          )}
                        </div>
                        {expandedGroups.has(largeFileSectionIndex) && (
                          <div className="px-4 pb-3 pt-0 border-t border-slate-600/60">
                            <div className="max-h-56 overflow-y-auto text-sm space-y-0.5">
                              {largeFiles.map((entry) => {
                                const inLfs = effectiveInLfs(entry);
                                const commitIdx = getLfsFileCommitIndex(entry);
                                const status = entry.commitMessage
                                  ? `Included in commit ${entry.commitMessage}`
                                  : commitIdx !== null
                                    ? `Will be in commit ${commitName || 'name'}_${commitIdx + 1}`
                                    : 'Uncommitted';
                                const statusColor =
                                  status === 'Uncommitted'
                                    ? 'text-red-400'
                                    : status.startsWith('Will be in commit')
                                      ? 'text-green-400'
                                      : 'text-slate-500';
                                return (
                                  <div
                                    key={entry.path}
                                    className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-slate-700/30"
                                    title={entry.path}
                                  >
                                    <span className="truncate flex-1 min-w-0 text-slate-300">
                                      {entry.path.split(/[/\\]/).pop() ?? entry.path}
                                    </span>
                                    <span className="text-slate-500 text-xs shrink-0">
                                      {formatSize(entry.size)}
                                    </span>
                                    <span className={`${statusColor} text-xs shrink-0 max-w-[180px] truncate`} title={status}>
                                      {status}
                                    </span>
                                    {inLfs ? (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveFromLfs(entry.path)}
                                        className="shrink-0 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-600/80 text-slate-200 hover:bg-slate-500/80"
                                      >
                                        Remove from LFS
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleAddToLfs(entry.path)}
                                        className="shrink-0 px-2 py-0.5 rounded-md text-xs font-medium bg-sky-600/80 text-white hover:bg-sky-500/80"
                                      >
                                        Add to LFS
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleBatchCommit}
              disabled={
                !commitName.trim() ||
                running ||
                !hasCommits
              }
              className="rounded-md px-4 py-2 bg-sky-600/80 hover:bg-sky-500/80 disabled:bg-slate-600 disabled:text-slate-500 text-white font-medium transition-colors w-fit"
            >
              {running ? 'Committing...' : 'Batch Commit'}
            </button>
          </>
        )}
      </div>
    </ToolGroup>
  );
}
