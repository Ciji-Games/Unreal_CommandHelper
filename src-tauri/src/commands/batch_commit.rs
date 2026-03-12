//! Batch commit command - scan uncommitted files, group by size, commit with LFS support.
//! Translates batchcommit.bat and checkLFS.bat.

use std::path::{Path, PathBuf};
use std::thread;
use std::time::Instant;

use tauri::{AppHandle, Emitter};

use crate::stream_processor;
use crate::utils::build_cmd;

const MIN_FILE_SIZE: u64 = 103_809_024; // 99MB - exclude from commit, show red warning
const DEFAULT_TARGET_SIZE: u64 = 209_715_200; // 200MB - default group target
const LFS_FILTER: &str = "filter=lfs diff=lfs merge=lfs -text";

fn resolve_project_dir(project_path: &str) -> PathBuf {
    let p = Path::new(project_path);
    if p.extension().map_or(false, |e| e == "uproject") {
        p.parent().unwrap_or(p).to_path_buf()
    } else {
        p.to_path_buf()
    }
}

fn find_git_root(project_dir: &Path) -> Result<PathBuf, String> {
    let mut search = project_dir.to_path_buf();
    for _ in 0..5 {
        if search.join(".git").exists() {
            return Ok(search);
        }
        search = match search.parent() {
            Some(p) => p.to_path_buf(),
            None => break,
        };
    }
    Err(".git directory not found (searched up to 5 parent levels)".to_string())
}

fn run_git(git_root: &Path, args: &[&str]) -> Result<String, String> {
    let args_str: Vec<String> = args.iter().map(|s| (*s).to_string()).collect();
    let mut cmd = build_cmd("git", &args_str, Some(git_root.to_str().unwrap_or("")));
    cmd.output()
        .map_err(|e| e.to_string())
        .and_then(|o| {
            if o.status.success() {
                Ok(String::from_utf8_lossy(&o.stdout).to_string())
            } else {
                Err(String::from_utf8_lossy(&o.stderr).to_string())
            }
        })
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    path: String,
    size: u64,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LargeFileEntry {
    path: String,
    size: u64,
    in_lfs: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    commit_message: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    git_root: String,
    small_files: Vec<FileEntry>,
    grouped_commits: Vec<Vec<FileEntry>>,
    large_files: Vec<LargeFileEntry>,
}

/// Get LFS patterns from .gitattributes (paths/globs that have filter=lfs).
fn get_lfs_patterns(git_root: &Path) -> std::collections::HashSet<String> {
    let attr_path = git_root.join(".gitattributes");
    if !attr_path.exists() {
        return std::collections::HashSet::new();
    }
    let Ok(content) = std::fs::read_to_string(&attr_path) else {
        return std::collections::HashSet::new();
    };
    content
        .lines()
        .filter(|line| line.contains("filter=lfs"))
        .filter_map(|line| line.split_whitespace().next().map(|s| s.replace('\\', "/")))
        .collect::<std::collections::HashSet<String>>()
}

/// Check if a path is tracked by LFS (exact match or glob match).
fn path_in_lfs(path: &str, lfs_patterns: &std::collections::HashSet<String>) -> bool {
    let path_norm = path.replace('\\', "/");
    for pattern in lfs_patterns {
        if path_norm == *pattern {
            return true;
        }
        if pattern.contains('*') {
            if let Some(suffix) = pattern.strip_prefix('*') {
                if path_norm.ends_with(suffix) {
                    return true;
                }
            }
        }
    }
    false
}

/// Scan uncommitted files and return grouped result for preview.
/// `target_size_bytes`: best-effort target size per commit group (100MB–1.8GB).
#[tauri::command]
pub fn scan_batch_commit(project_path: String, target_size_bytes: Option<u64>) -> Result<ScanResult, String> {
    let project_dir = resolve_project_dir(&project_path);
    let git_root = find_git_root(&project_dir)?;

    // Get untracked files
    let untracked = run_git(&git_root, &["ls-files", "--others", "--exclude-standard"])?;
    // Get modified files
    let modified = run_git(&git_root, &["diff", "--name-only", "--diff-filter=M"])?;

    let mut all_paths: Vec<String> = untracked
        .lines()
        .chain(modified.lines())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    all_paths.sort();
    all_paths.dedup();

    let lfs_patterns = get_lfs_patterns(&git_root);
    let mut commitable: Vec<FileEntry> = Vec::new();
    let mut large_files: Vec<LargeFileEntry> = Vec::new();

    for rel_path in &all_paths {
        let full_path = git_root.join(rel_path);
        if !full_path.exists() || full_path.is_dir() {
            continue;
        }
        let size = std::fs::metadata(&full_path).map_err(|e| e.to_string())?.len();
        if size >= MIN_FILE_SIZE {
            large_files.push(LargeFileEntry {
                path: rel_path.clone(),
                size,
                in_lfs: path_in_lfs(rel_path, &lfs_patterns),
                commit_message: None,
            });
        } else {
            commitable.push(FileEntry {
                path: rel_path.clone(),
                size,
            });
        }
    }

    // Add committed LFS large files (tracked, in LFS, already committed)
    let tracked = run_git(&git_root, &["ls-files"]).unwrap_or_default();
    let uncommitted_paths: std::collections::HashSet<&str> =
        all_paths.iter().map(|s| s.as_str()).collect();
    for rel_path in tracked.lines().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        if uncommitted_paths.contains(rel_path) {
            continue;
        }
        let full_path = git_root.join(rel_path);
        if !full_path.exists() || full_path.is_dir() {
            continue;
        }
        let Ok(meta) = std::fs::metadata(&full_path) else {
            continue;
        };
        let size = meta.len();
        if size < MIN_FILE_SIZE || !path_in_lfs(rel_path, &lfs_patterns) {
            continue;
        }
        let commit_msg = run_git(&git_root, &["log", "-1", "--format=%s", "--", rel_path]).ok();
        large_files.push(LargeFileEntry {
            path: rel_path.to_string(),
            size,
            in_lfs: true,
            commit_message: commit_msg.filter(|s| !s.is_empty()),
        });
    }

    // Group commitable files by target size (best-effort near target)
    let target = target_size_bytes.unwrap_or(DEFAULT_TARGET_SIZE).clamp(
        100 * 1024 * 1024,      // 100 MB min
        1800 * 1024 * 1024,     // 1.8 GB max
    );
    let mut grouped_commits: Vec<Vec<FileEntry>> = Vec::new();
    let mut current_group: Vec<FileEntry> = Vec::new();
    let mut current_size: u64 = 0;

    for entry in commitable {
        if current_size + entry.size >= target && !current_group.is_empty() {
            grouped_commits.push(std::mem::take(&mut current_group));
            current_size = 0;
        }
        current_size += entry.size;
        current_group.push(entry);
    }
    if !current_group.is_empty() {
        grouped_commits.push(current_group);
    }

    // small_files = all commitable (they're now in grouped_commits; we could flatten for display)
    let small_files: Vec<FileEntry> = grouped_commits.iter().flatten().cloned().collect();

    Ok(ScanResult {
        git_root: git_root.to_string_lossy().to_string(),
        small_files,
        grouped_commits,
        large_files,
    })
}

/// Add paths to .gitattributes with LFS filter (checkLFS logic).
#[tauri::command]
pub fn add_to_lfs(project_path: String, paths: Vec<String>) -> Result<u32, String> {
    let project_dir = resolve_project_dir(&project_path);
    let git_root = find_git_root(&project_dir)?;
    let attr_path = git_root.join(".gitattributes");

    let existing: std::collections::HashSet<String> = if attr_path.exists() {
        std::fs::read_to_string(&attr_path)
            .map_err(|e| e.to_string())?
            .lines()
            .filter_map(|line| {
                line.split_whitespace().next().map(|s| {
                    s.replace('\\', "/")
                })
            })
            .collect()
    } else {
        std::collections::HashSet::new()
    };

    let mut added = 0u32;
    let mut to_append = String::new();
    let mut added_this_run: std::collections::HashSet<String> = std::collections::HashSet::new();

    for path in &paths {
        let path_norm = path.replace('\\', "/");
        if existing.contains(&path_norm) || added_this_run.contains(&path_norm) {
            continue;
        }
        to_append.push_str(&format!("{} {}\n", path_norm, LFS_FILTER));
        added_this_run.insert(path_norm);
        added += 1;
    }

    if added > 0 {
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&attr_path)
            .map_err(|e| e.to_string())?;
        f.write_all(to_append.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    Ok(added)
}

/// Remove paths from .gitattributes (LFS tracking).
#[tauri::command]
pub fn remove_from_lfs(project_path: String, paths: Vec<String>) -> Result<u32, String> {
    let project_dir = resolve_project_dir(&project_path);
    let git_root = find_git_root(&project_dir)?;
    let attr_path = git_root.join(".gitattributes");

    if !attr_path.exists() {
        return Ok(0);
    }

    let to_remove: std::collections::HashSet<String> = paths
        .iter()
        .map(|p| p.replace('\\', "/"))
        .collect();

    let content = std::fs::read_to_string(&attr_path).map_err(|e| e.to_string())?;
    let mut removed = 0u32;
    let new_lines: Vec<&str> = content
        .lines()
        .filter(|line| {
            let pattern = line.split_whitespace().next().map(|s| s.replace('\\', "/"));
            if let Some(ref p) = pattern {
                if to_remove.contains(p) {
                    removed += 1;
                    return false;
                }
            }
            true
        })
        .collect();

    if removed > 0 {
        let new_content = new_lines.join("\n");
        let needs_newline = !new_content.is_empty() && !new_content.ends_with('\n');
        std::fs::write(
            &attr_path,
            if needs_newline {
                format!("{}\n", new_content)
            } else {
                new_content
            },
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(removed)
}

/// Event names for frontend to listen when batch commit runs in background.
pub const BATCH_COMMIT_COMPLETE: &str = "batch-commit-complete";
pub const BATCH_COMMIT_ERROR: &str = "batch-commit-error";

/// Run batch commit logic (returns Err on failure). Used by both sync and background paths.
fn run_batch_commit_impl(
    project_path: String,
    commit_name: String,
    groups: Vec<Vec<String>>,
    lfs_paths: Vec<String>,
    app: &AppHandle,
) -> Result<(), String> {
    let start = Instant::now();
    let project_dir = resolve_project_dir(&project_path);
    let git_root = find_git_root(&project_dir)?;
    let git_root_str = git_root.to_str().ok_or("Invalid git root path")?;

    // Total steps: LFS (if any) + each commit group
    let has_lfs = !lfs_paths.is_empty();
    let total_steps = (if has_lfs { 1 } else { 0 }) + groups.iter().filter(|g| !g.is_empty()).count();
    let mut completed_steps = 0u32;

    // 1. Add to LFS first if any large files selected
    if has_lfs {
        stream_processor::emit_progress(app, 0, start.elapsed().as_millis() as u64);
        let added = add_to_lfs(project_path.clone(), lfs_paths.clone())?;
        if added > 0 {
            stream_processor::emit_log(
                app,
                &format!("Added {} file(s) to .gitattributes (LFS)", added),
                Some("blue"),
            );
        }
        completed_steps += 1;
        let pct = if total_steps > 0 {
            (completed_steps * 100) / total_steps as u32
        } else {
            100
        };
        stream_processor::emit_progress(app, pct, start.elapsed().as_millis() as u64);
    }

    // 2. Groups are pre-distributed by the frontend (LFS paths already in groups).
    //    We use groups as-is; lfs_paths was only for add_to_lfs above.

    // 3. Commit each group
    let lfs_set: std::collections::HashSet<&str> = lfs_paths.iter().map(|s| s.as_str()).collect();
    let mut gitattributes_committed = false;

    for (idx, group) in groups.iter().enumerate() {
        if group.is_empty() {
            continue;
        }
        let msg = format!("{}_{}", commit_name, idx + 1);
        stream_processor::emit_log(app, &format!("Committing group {}...", idx + 1), Some("blue"));

        // Include .gitattributes in the first group that contains LFS files so they are properly flagged
        let group_has_lfs = group.iter().any(|p| lfs_set.contains(p.as_str()));
        if group_has_lfs && !gitattributes_committed {
            let attr_path = git_root.join(".gitattributes");
            if attr_path.exists() {
                let args = vec!["add".to_string(), ".gitattributes".to_string()];
                let mut cmd = build_cmd("git", &args, Some(git_root_str));
                let out = cmd.output().map_err(|e| e.to_string())?;
                if !out.status.success() {
                    let err = String::from_utf8_lossy(&out.stderr);
                    stream_processor::emit_log(app, &format!("[ERROR] git add .gitattributes: {}", err), Some("red"));
                } else {
                    gitattributes_committed = true;
                }
            }
        }

        // Batch git add to avoid spawning one process per file (reduces UI freeze with many files)
        const BATCH_CHAR_LIMIT: usize = 4000; // Stay under Windows cmd line limit (~8191)
        let mut batch: Vec<String> = Vec::new();
        let mut batch_len: usize = 0;
        for path in group {
            let path_len = path.len() + 1; // +1 for space
            if batch_len + path_len > BATCH_CHAR_LIMIT && !batch.is_empty() {
                let mut args = vec!["add".to_string()];
                args.append(&mut batch);
                let mut cmd = build_cmd("git", &args, Some(git_root_str));
                let out = cmd.output().map_err(|e| e.to_string())?;
                if !out.status.success() {
                    let err = String::from_utf8_lossy(&out.stderr);
                    stream_processor::emit_log(app, &format!("[ERROR] git add (batch): {}", err), Some("red"));
                }
                batch = Vec::new();
                batch_len = 0;
                thread::yield_now(); // Let UI process events between batches
            }
            batch.push(path.clone());
            batch_len += path_len;
        }
        if !batch.is_empty() {
            let mut args = vec!["add".to_string()];
            args.append(&mut batch);
            let mut cmd = build_cmd("git", &args, Some(git_root_str));
            let out = cmd.output().map_err(|e| e.to_string())?;
            if !out.status.success() {
                let err = String::from_utf8_lossy(&out.stderr);
                stream_processor::emit_log(app, &format!("[ERROR] git add (batch): {}", err), Some("red"));
            }
        }

        let args = vec!["commit".to_string(), "-m".to_string(), msg.clone()];
        let mut cmd = build_cmd("git", &args, Some(git_root_str));
        let out = cmd.output().map_err(|e| e.to_string())?;
        if out.status.success() {
            stream_processor::emit_log(app, &format!("Committed: {}", msg), Some("green"));
        } else {
            let err = String::from_utf8_lossy(&out.stderr);
            if err.contains("nothing to commit") {
                stream_processor::emit_log(app, &format!("Nothing to commit for group {} (already staged?)", idx + 1), Some("orange"));
            } else {
                return Err(format!("git commit failed: {}", err));
            }
        }

        completed_steps += 1;
        let pct = if total_steps > 0 {
            (completed_steps * 100) / total_steps as u32
        } else {
            100
        };
        stream_processor::emit_progress(app, pct, start.elapsed().as_millis() as u64);
    }

    stream_processor::emit_progress(app, 100, start.elapsed().as_millis() as u64);
    stream_processor::emit_log(app, "Batch commit completed.", Some("green"));
    Ok(())
}

/// Execute batch commit in a background thread. Returns immediately so the UI stays responsive
/// (especially when tabbed out). Emits batch-commit-complete or batch-commit-error when done.
#[tauri::command]
pub fn batch_commit(
    project_path: String,
    commit_name: String,
    groups: Vec<Vec<String>>,
    lfs_paths: Vec<String>,
    app: AppHandle,
) -> Result<(), String> {
    let project_path = project_path;
    let commit_name = commit_name;
    let groups = groups;
    let lfs_paths = lfs_paths;

    std::thread::spawn(move || {
        match run_batch_commit_impl(project_path, commit_name, groups, lfs_paths, &app) {
            Ok(()) => {
                let _ = app.emit(BATCH_COMMIT_COMPLETE, ());
            }
            Err(e) => {
                let _ = app.emit(BATCH_COMMIT_ERROR, e);
            }
        }
    });

    Ok(())
}
