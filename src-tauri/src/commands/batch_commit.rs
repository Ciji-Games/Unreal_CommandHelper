//! Batch commit command - scan uncommitted files, group by size, commit with LFS support.
//! Translates batchcommit.bat and checkLFS.bat.

use std::path::{Path, PathBuf};
use std::time::Instant;

use tauri::AppHandle;

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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    git_root: String,
    small_files: Vec<FileEntry>,
    grouped_commits: Vec<Vec<FileEntry>>,
    large_files: Vec<FileEntry>,
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

    let mut commitable: Vec<FileEntry> = Vec::new();
    let mut large_files: Vec<FileEntry> = Vec::new();

    for rel_path in &all_paths {
        let full_path = git_root.join(rel_path);
        if !full_path.exists() || full_path.is_dir() {
            continue;
        }
        let size = std::fs::metadata(&full_path).map_err(|e| e.to_string())?.len();
        let entry = FileEntry {
            path: rel_path.clone(),
            size,
        };
        if size >= MIN_FILE_SIZE {
            large_files.push(entry);
        } else {
            commitable.push(entry);
        }
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

/// Execute batch commit: add to LFS first if needed, then git add + commit each group.
#[tauri::command]
pub fn batch_commit(
    project_path: String,
    commit_name: String,
    groups: Vec<Vec<String>>,
    lfs_paths: Vec<String>,
    app: AppHandle,
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
        stream_processor::emit_progress(&app, 0, start.elapsed().as_millis() as u64);
        let added = add_to_lfs(project_path.clone(), lfs_paths.clone())?;
        if added > 0 {
            stream_processor::emit_log(
                &app,
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
        stream_processor::emit_progress(&app, pct, start.elapsed().as_millis() as u64);
    }

    // 2. Build groups: append lfs_paths to last group
    let mut groups = groups;
    if !lfs_paths.is_empty() {
        if groups.is_empty() {
            groups.push(lfs_paths);
        } else {
            let last = groups.len() - 1;
            groups[last].extend(lfs_paths);
        }
    }

    // 3. Commit each group
    for (idx, group) in groups.iter().enumerate() {
        if group.is_empty() {
            continue;
        }
        let msg = format!("{}_{}", commit_name, idx + 1);
        stream_processor::emit_log(&app, &format!("Committing group {}...", idx + 1), Some("blue"));

        for path in group {
            let args = vec!["add".to_string(), path.clone()];
            let mut cmd = build_cmd("git", &args, Some(git_root_str));
            let out = cmd.output().map_err(|e| e.to_string())?;
            if !out.status.success() {
                let err = String::from_utf8_lossy(&out.stderr);
                stream_processor::emit_log(&app, &format!("[ERROR] git add {}: {}", path, err), Some("red"));
            }
        }

        let args = vec!["commit".to_string(), "-m".to_string(), msg.clone()];
        let mut cmd = build_cmd("git", &args, Some(git_root_str));
        let out = cmd.output().map_err(|e| e.to_string())?;
        if out.status.success() {
            stream_processor::emit_log(&app, &format!("Committed: {}", msg), Some("green"));
        } else {
            let err = String::from_utf8_lossy(&out.stderr);
            if err.contains("nothing to commit") {
                stream_processor::emit_log(&app, &format!("Nothing to commit for group {} (already staged?)", idx + 1), Some("orange"));
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
        stream_processor::emit_progress(&app, pct, start.elapsed().as_millis() as u64);
    }

    stream_processor::emit_progress(&app, 100, start.elapsed().as_millis() as u64);
    stream_processor::emit_log(&app, "Batch commit completed.", Some("green"));
    Ok(())
}
