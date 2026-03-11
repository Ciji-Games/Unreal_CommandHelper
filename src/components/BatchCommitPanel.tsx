/**
 * Batch Commit panel - scan uncommitted files, preview groups, batch commit with LFS support.
 * Translates batchcommit.bat and checkLFS.bat.
 */

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjects } from '../hooks/useProjects';
import { useLog } from '../contexts/LogContext';
import { useProgress } from '../contexts/ProgressContext';
import { ToolGroup } from './ToolGroup';
import { FileTree, type FileEntry } from './FileTree';
import type { ProjectInfo } from '../types';
import { getProjectDisplayLabel } from '../utils/project';

const SMALL_FILE_THRESHOLD = 1 * 1024 * 1024; // 1MB - collapse below this
const LARGE_FILE_THRESHOLD = 99 * 1024 * 1024; // 99MB - red warning

const TARGET_SIZE_MIN_MB = 100;
const TARGET_SIZE_MAX_MB = 1800; // 1.8 GB
const TARGET_SIZE_DEFAULT_MB = 200;

interface ScanResult {
  gitRoot: string;
  smallFiles: FileEntry[];
  groupedCommits: FileEntry[][];
  largeFiles: FileEntry[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BatchCommitPanel() {
  const { projects, addProject } = useProjects();
  const { clearLog } = useLog();
  const { startProgress, finishProgress } = useProgress();
  const [selectedProjectPath, setSelectedProjectPath] = useState<string>('');
  const [commitName, setCommitName] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedLargeFilesForLFS, setSelectedLargeFilesForLFS] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [targetSizeMb, setTargetSizeMb] = useState(TARGET_SIZE_DEFAULT_MB);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set([0]));
  const [filePreviewExpanded, setFilePreviewExpanded] = useState(true);

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
      setSelectedLargeFilesForLFS(new Set());
      setExpandedGroups(new Set([0]));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Scan failed: ${msg}`);
    } finally {
      setRunning(false);
      finishProgress();
    }
  };

  const toggleLFS = (path: string) => {
    setSelectedLargeFilesForLFS((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
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
    startProgress();
    try {
      if (selectedLargeFilesForLFS.size > 0) {
        await invoke('add_to_lfs', {
          projectPath,
          paths: Array.from(selectedLargeFilesForLFS),
        });
      }
      const groups = scanResult.groupedCommits.map((g) => g.map((e) => e.path));
      await invoke('batch_commit', {
        projectPath,
        commitName: commitName.trim(),
        groups,
        lfsPaths: Array.from(selectedLargeFilesForLFS),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Batch commit failed: ${msg}`);
    } finally {
      setRunning(false);
      finishProgress();
    }
  };

  const smallFiles = scanResult?.smallFiles ?? [];
  const largeFiles = scanResult?.largeFiles ?? [];
  const groupedCommits = scanResult?.groupedCommits ?? [];

  const hasContent = smallFiles.length > 0 || largeFiles.length > 0;

  return (
    <ToolGroup
      title="Batch Commit"
      description="Scan uncommitted files, preview commit groups, and batch commit. Large files (≥99MB) can be added to LFS before committing."
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-sm text-zinc-300 mb-1">Project</label>
          <select
            value={selectedProjectPath}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          >
            <option value="">
              {projects.length === 0 ? 'No projects available' : 'Select a project'}
            </option>
            {projects.map((p) => (
              <option key={p.projectPath} value={p.projectPath}>
                {getProjectDisplayLabel(p)}
              </option>
            ))}
            <option value="__browse__">Browse new project...</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-zinc-300 mb-1">
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
              setScanResult(null); // Clear stale groups; re-scan to apply new target
            }}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-zinc-700 accent-amber-500"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Best-effort target per commit group (100 MB – 1.8 GB)
          </p>
        </div>

        <div>
          <label className="block text-sm text-zinc-300 mb-1">Commit name</label>
          <input
            type="text"
            value={commitName}
            onChange={(e) => setCommitName(e.target.value)}
            placeholder="e.g. My changes"
            className="w-full rounded bg-zinc-800 border border-zinc-600 text-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none placeholder:text-zinc-500"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Commits will be named: {commitName || 'name'}_1, {commitName || 'name'}_2, ...
          </p>
        </div>

        <button
          type="button"
          onClick={handleScan}
          disabled={!selectedProjectPath || selectedProjectPath === '__browse__' || running}
          className="rounded px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors w-fit"
        >
          {running ? 'Scanning...' : 'Scan'}
        </button>

        {scanResult && (
          <>
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setFilePreviewExpanded(!filePreviewExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-700/30 transition-colors"
              >
                <h4 className="text-sm font-semibold text-zinc-200">File preview</h4>
                <span className="text-zinc-500">
                  {filePreviewExpanded ? '▼' : '▶'}
                </span>
              </button>
              {filePreviewExpanded && (
                <div className="px-4 pb-4 pt-0 space-y-4 border-t border-zinc-700/60">
                  {!hasContent ? (
                    <p className="text-sm text-zinc-500 py-2">No uncommitted or unstaged files found.</p>
                  ) : (
                    <>
                      {smallFiles.length > 0 && (
                        <div>
                          <p className="text-xs text-zinc-500 mb-2">
                            Commitable files ({smallFiles.length}) — grouped by target size below
                          </p>
                          <FileTree
                            entries={smallFiles}
                            entryVariant={(e) =>
                              e.size >= SMALL_FILE_THRESHOLD && e.size < LARGE_FILE_THRESHOLD
                                ? 'warning'
                                : 'default'
                            }
                            maxHeight="max-h-40"
                            defaultExpandedDepth={1}
                          />
                        </div>
                      )}
                      {largeFiles.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-red-400 font-medium">
                            Files ≥99MB — add to LFS to include in commit:
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedLargeFilesForLFS((prev) => {
                                const next = new Set(prev);
                                largeFiles.forEach((e) => next.add(e.path));
                                return next;
                              })
                            }
                            className="px-2 py-1 rounded text-xs font-medium bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                          >
                            Add all files to LFS
                          </button>
                          <ul className="space-y-1 max-h-28 overflow-y-auto">
                            {largeFiles.map((e) => (
                              <li
                                key={e.path}
                                className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-700/40"
                              >
                                <span className="text-red-400/90 truncate flex-1 text-sm" title={e.path}>
                                  {e.path}
                                </span>
                                <span className="text-zinc-500 text-xs shrink-0">{formatSize(e.size)}</span>
                                <button
                                  type="button"
                                  onClick={() => toggleLFS(e.path)}
                                  className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${
                                    selectedLargeFilesForLFS.has(e.path)
                                      ? 'bg-amber-600 text-white'
                                      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                                  }`}
                                >
                                  {selectedLargeFilesForLFS.has(e.path) ? 'Added to LFS' : 'Add to LFS'}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-700">
                <h4 className="text-sm font-semibold text-zinc-200">Commit preview</h4>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {groupedCommits.length} group(s) · Click to expand and browse files
                </p>
              </div>
              <div className="divide-y divide-zinc-700/80">
                {groupedCommits.length === 0 && selectedLargeFilesForLFS.size === 0 ? (
                  <div className="p-4">
                    <p className="text-sm text-zinc-500">No commits to create.</p>
                  </div>
                ) : (
                  <>
                    {groupedCommits.map((group, i) => {
                      const totalSize = group.reduce((s, e) => s + e.size, 0);
                      const isExpanded = expandedGroups.has(i);
                      const extra =
                        i === groupedCommits.length - 1 && selectedLargeFilesForLFS.size > 0
                          ? ` + ${selectedLargeFilesForLFS.size} LFS`
                          : '';
                      return (
                        <div key={i} className="bg-zinc-800/30">
                          <button
                            type="button"
                            onClick={() => toggleGroup(i)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-700/40 transition-colors"
                          >
                            <span className="text-zinc-500 shrink-0">
                              {isExpanded ? '▼' : '▶'}
                            </span>
                            <span className="font-medium text-amber-400/95">
                              {commitName || 'name'}_{i + 1}
                            </span>
                            <span className="text-zinc-500 text-sm">
                              {group.length} files · {formatSize(totalSize)}
                              {extra}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="px-4 pb-3 pt-0 border-t border-zinc-700/60">
                              <FileTree
                                entries={group}
                                maxHeight="max-h-56"
                                defaultExpandedDepth={2}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {groupedCommits.length === 0 && selectedLargeFilesForLFS.size > 0 && (
                      <div className="px-4 py-3">
                        <span className="font-medium text-amber-400/95">
                          {commitName || 'name'}_1
                        </span>
                        <span className="text-zinc-500 text-sm ml-2">
                          {selectedLargeFilesForLFS.size} LFS file(s)
                        </span>
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
                (!hasContent && selectedLargeFilesForLFS.size === 0)
              }
              className="rounded px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors w-fit"
            >
              {running ? 'Committing...' : 'Batch Commit'}
            </button>
          </>
        )}
      </div>
    </ToolGroup>
  );
}
