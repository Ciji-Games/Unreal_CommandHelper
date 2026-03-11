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
import type { ProjectInfo } from '../types';
import { getProjectDisplayLabel } from '../utils/project';

const SMALL_FILE_THRESHOLD = 1 * 1024 * 1024; // 1MB - collapse below this
const LARGE_FILE_THRESHOLD = 99 * 1024 * 1024; // 99MB - red warning

interface FileEntry {
  path: string;
  size: number;
}

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
  const [smallFilesExpanded, setSmallFilesExpanded] = useState(false);
  const [running, setRunning] = useState(false);

  const selectedProject = projects.find((p) => p.projectPath === selectedProjectPath);

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
      const result = await invoke<ScanResult>('scan_batch_commit', {
        projectPath,
      });
      setScanResult(result);
      setSelectedLargeFilesForLFS(new Set());
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

  const tinyFiles = smallFiles.filter((e) => e.size < SMALL_FILE_THRESHOLD);
  const mediumFiles = smallFiles.filter(
    (e) => e.size >= SMALL_FILE_THRESHOLD && e.size < LARGE_FILE_THRESHOLD
  );

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
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-zinc-200">File preview</h4>

              {tinyFiles.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setSmallFilesExpanded(!smallFilesExpanded)}
                    className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white"
                  >
                    <span className="text-zinc-500">
                      {smallFilesExpanded ? '▼' : '▶'}
                    </span>
                    {tinyFiles.length} small files
                  </button>
                  {smallFilesExpanded && (
                    <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-zinc-400 space-y-1 pl-4">
                      {tinyFiles.map((e) => (
                        <li key={e.path} className="truncate">
                          {e.path} ({formatSize(e.size)})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {mediumFiles.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-amber-400 font-medium">
                    Files under 99MB (orange warning):
                  </p>
                  <ul className="max-h-32 overflow-y-auto text-xs space-y-1">
                    {mediumFiles.map((e) => (
                      <li
                        key={e.path}
                        className="flex items-center gap-2 py-0.5 border-l-2 border-amber-500/60 pl-2"
                      >
                        <span className="text-amber-400/90 truncate flex-1">{e.path}</span>
                        <span className="text-zinc-500 shrink-0">{formatSize(e.size)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {largeFiles.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-red-400 font-medium">
                    Files ≥99MB (red) — add to LFS to include in commit:
                  </p>
                  <ul className="max-h-32 overflow-y-auto text-xs space-y-1">
                    {largeFiles.map((e) => (
                      <li
                        key={e.path}
                        className="flex items-center gap-2 py-0.5 border-l-2 border-red-500/60 pl-2"
                      >
                        <span className="text-red-400/90 truncate flex-1">{e.path}</span>
                        <span className="text-zinc-500 shrink-0">{formatSize(e.size)}</span>
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

              {!hasContent && (
                <p className="text-sm text-zinc-500">No uncommitted or unstaged files found.</p>
              )}
            </div>

            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 space-y-2">
              <h4 className="text-sm font-semibold text-zinc-200">Commit preview</h4>
              {groupedCommits.length === 0 && selectedLargeFilesForLFS.size === 0 ? (
                <p className="text-sm text-zinc-500">No commits to create.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {groupedCommits.map((group, i) => {
                    const totalSize = group.reduce((s, e) => s + e.size, 0);
                    const extra =
                      i === groupedCommits.length - 1 && selectedLargeFilesForLFS.size > 0
                        ? ` + ${selectedLargeFilesForLFS.size} LFS file(s)`
                        : '';
                    return (
                      <li key={i} className="text-zinc-300">
                        {commitName || 'name'}_{i + 1} — {group.length} files, {formatSize(totalSize)}
                        {extra}
                      </li>
                    );
                  })}
                  {groupedCommits.length === 0 && selectedLargeFilesForLFS.size > 0 && (
                    <li className="text-zinc-300">
                      {commitName || 'name'}_1 — {selectedLargeFilesForLFS.size} LFS file(s)
                    </li>
                  )}
                </ul>
              )}
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
