/**
 * File tree component - renders file paths as a collapsible folder hierarchy.
 */

import { useState } from 'react';

export interface FileEntry {
  path: string;
  size: number;
}

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  files: FileEntry[];
  totalSize: number;
}

function buildTree(entries: FileEntry[]): TreeNode {
  const root: TreeNode = { name: '', children: new Map(), files: [], totalSize: 0 };

  for (const entry of entries) {
    const parts = entry.path.split(/[/\\]/).filter(Boolean);
    let node = root;
    node.totalSize += entry.size;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        node.files.push(entry);
      } else {
        if (!node.children.has(part)) {
          node.children.set(part, {
            name: part,
            children: new Map(),
            files: [],
            totalSize: 0,
          });
        }
        node = node.children.get(part)!;
        node.totalSize += entry.size;
      }
    }
  }

  return root;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileTreeProps {
  entries: FileEntry[];
  formatSize?: (bytes: number) => string;
  /** Optional: 'warning' for medium (orange), 'danger' for large/LFS */
  entryVariant?: (entry: FileEntry) => 'default' | 'warning' | 'danger' | null;
  maxHeight?: string;
  defaultExpandedDepth?: number;
}

export function FileTree({
  entries,
  formatSize: formatSizeProp,
  entryVariant,
  maxHeight = 'max-h-48',
  defaultExpandedDepth = 1,
}: FileTreeProps) {
  const fmt = formatSizeProp ?? formatSize;
  const root = buildTree(entries);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const addExpanded = (node: TreeNode, path: string, depth: number) => {
      if (depth < defaultExpandedDepth && (node.children.size > 0 || node.files.length > 0)) {
        s.add(path);
        for (const [name, child] of node.children) {
          addExpanded(child, path ? `${path}/${name}` : name, depth + 1);
        }
      }
    };
    for (const [name, child] of root.children) {
      addExpanded(child, name, 0);
    }
    return s;
  });

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNode = (node: TreeNode, path: string, depth: number) => {
    const indent = depth * 12;

    const folderEntries = Array.from(node.children.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    const sortedFiles = [...node.files].sort((a, b) => a.path.localeCompare(b.path));

    return (
      <div key={path || 'root'} className="select-none">
        {/* Folders */}
        {folderEntries.map(([name, child]) => {
          const childPath = path ? `${path}/${name}` : name;
          const childHasContent = child.children.size > 0 || child.files.length > 0;
          const childExpanded = expanded.has(childPath);

          return (
            <div key={childPath}>
              <button
                type="button"
                onClick={() => childHasContent && toggle(childPath)}
                className="flex items-center gap-1.5 py-0.5 pr-2 hover:bg-zinc-700/50 rounded w-full text-left group"
                style={{ paddingLeft: indent }}
              >
                <span className="w-4 shrink-0 text-zinc-500">
                  {childHasContent ? (childExpanded ? '▼' : '▶') : '·'}
                </span>
                <span className="text-amber-400/90 truncate flex-1">{child.name}</span>
                <span className="text-zinc-500 text-xs shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {fmt(child.totalSize)}
                </span>
              </button>
              {childHasContent && childExpanded && renderNode(child, childPath, depth + 1)}
            </div>
          );
        })}

        {/* Files in this folder */}
        {sortedFiles.map((entry) => {
          const variant = entryVariant?.(entry) ?? 'default';
          const variantStyles = {
            default: 'text-zinc-300',
            warning: 'text-amber-400/90',
            danger: 'text-red-400/90',
          };
          return (
            <div
              key={entry.path}
              className={`flex items-center gap-2 py-0.5 pr-2 hover:bg-zinc-700/30 rounded truncate ${variantStyles[variant]}`}
              style={{ paddingLeft: indent + 20 }}
              title={entry.path}
            >
              <span className="truncate flex-1 min-w-0">{entry.path.split(/[/\\]/).pop()}</span>
              <span className="text-zinc-500 text-xs shrink-0">{fmt(entry.size)}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const content = (
    <>
      {Array.from(root.children.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, child]) => {
          const path = name;
          return (
            <div key={path}>
              {renderNode(child, path, 0)}
            </div>
          );
        })}
      {root.files.map((entry) => {
        const variant = entryVariant?.(entry) ?? 'default';
        const variantStyles = {
          default: 'text-zinc-300',
          warning: 'text-amber-400/90',
          danger: 'text-red-400/90',
        };
        return (
          <div
            key={entry.path}
            className={`flex items-center gap-2 py-0.5 pr-2 hover:bg-zinc-700/30 rounded ${variantStyles[variant]}`}
            title={entry.path}
          >
            <span className="w-4 shrink-0" />
            <span className="truncate flex-1">{entry.path}</span>
            <span className="text-zinc-500 text-xs shrink-0">{fmt(entry.size)}</span>
          </div>
        );
      })}
    </>
  );

  return (
    <div className={`overflow-y-auto text-sm ${maxHeight}`}>
      {content}
    </div>
  );
}
