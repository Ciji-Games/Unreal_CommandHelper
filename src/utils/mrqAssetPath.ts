/**
 * Convert filesystem path to Unreal asset path for Movie Render Queue.
 * Content/Cinematics/myRenderQueue.uasset -> /Game/Cinematics/myRenderQueue
 * Level Sequence: asset name is duplicated per Epic format.
 */

export type MrqAssetType = 'queue' | 'level_sequence' | 'config';

/**
 * Get project Content directory from .uproject path.
 * Uses native path separators for the dialog defaultPath (Windows needs backslashes).
 */
export function getContentDir(projectPath: string): string {
  const sep = Math.max(projectPath.lastIndexOf('/'), projectPath.lastIndexOf('\\'));
  const projectDir = sep >= 0 ? projectPath.slice(0, sep) : projectPath;
  const pathSep = projectPath.includes('\\') ? '\\' : '/';
  return `${projectDir.replace(/[/\\]+$/, '')}${pathSep}Content`;
}

/**
 * Convert filesystem path to Unreal asset path.
 * @param projectPath - Path to .uproject file
 * @param fsPath - Full path to .uasset file (must be under project Content)
 * @param assetType - 'queue' | 'level_sequence' | 'config'
 * @returns Unreal path e.g. /Game/Cinematics/myRenderQueue, or null if invalid
 */
export function fsPathToUnrealAssetPath(
  projectPath: string,
  fsPath: string,
  assetType: MrqAssetType
): string | null {
  const contentDir = getContentDir(projectPath);
  const normalizedContent = contentDir.replace(/\\/g, '/').toLowerCase();
  const normalizedFs = fsPath.replace(/\\/g, '/');
  const normalizedFsLower = normalizedFs.toLowerCase();

  if (!normalizedFsLower.includes(normalizedContent) || !normalizedFsLower.endsWith('.uasset')) {
    return null;
  }

  // Get path relative to Content
  const contentIdx = normalizedFsLower.indexOf(normalizedContent);
  const afterContent = normalizedFs.slice(contentIdx + normalizedContent.length).replace(/^[/\\]+/, '');
  const withoutExt = afterContent.replace(/\.uasset$/i, '');
  const parts = withoutExt.split(/[/\\]/).filter(Boolean);
  const assetName = parts.pop() ?? '';

  if (assetType === 'level_sequence') {
    // Epic format: /Game/Cinematics/CameraMove001.CameraMove001 (asset name duplicated)
    const folderPath = parts.length > 0 ? parts.join('/') : '';
    const fullPath = folderPath ? `${folderPath}/${assetName}.${assetName}` : `${assetName}.${assetName}`;
    return `/Game/${fullPath}`;
  }

  // Queue and config: /Game/Cinematics/myRenderQueue
  const relativePath = parts.length > 0 ? `${parts.join('/')}/${assetName}` : assetName;
  return `/Game/${relativePath}`;
}
