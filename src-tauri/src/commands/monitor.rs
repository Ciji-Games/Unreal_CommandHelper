//! Process monitoring - generic & modular system to check if programs are running.
//! Used by features like Regenerate Project (warns when UE/Rider/VS block proper generation).

use serde::Serialize;
use sysinfo::System;

/// Result for a single monitored process/application
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStatus {
    /// Unique identifier for this process definition (e.g. "unreal_engine")
    pub id: String,
    /// Human-readable display name (e.g. "Unreal Engine")
    pub display_name: String,
    /// Whether any instance of this process is currently running
    pub is_running: bool,
    /// PIDs of running instances (empty if not running)
    pub pids: Vec<u32>,
}

/// Definition of a process to monitor - patterns are matched case-insensitively against process names
#[derive(Clone)]
pub struct ProcessDefinition {
    pub id: &'static str,
    pub display_name: &'static str,
    /// Substrings to match in process name (e.g. "UnrealEditor" matches UnrealEditor.exe, "UE4Editor" matches UE4Editor.exe)
    pub patterns: &'static [&'static str],
}

/// Predefined process groups for different features.
/// Add new groups here to support more features.
pub mod process_groups {
    use super::ProcessDefinition;

    /// Processes that block proper project regeneration (lock files, prevent clean generation)
    pub const REGENERATE_BLOCKING: &[ProcessDefinition] = &[
        ProcessDefinition {
            id: "unreal_engine",
            display_name: "Unreal Engine",
            patterns: &["UnrealEditor", "UE4Editor"],
        },
        ProcessDefinition {
            id: "rider",
            display_name: "JetBrains Rider",
            patterns: &["Rider", "rider64"],
        },
        ProcessDefinition {
            id: "visual_studio",
            display_name: "Visual Studio",
            patterns: &["devenv"],
        },
    ];

    /// Processes that block HLOD/MiniMap build/delete (Unreal must be closed; VS/Rider are fine)
    pub const UMAP_BLOCKING: &[ProcessDefinition] = &[ProcessDefinition {
        id: "unreal_engine",
        display_name: "Unreal Engine",
        patterns: &["UnrealEditor", "UE4Editor"],
    }];

    /// Processes that block Cook/Package/Build (Unreal must be closed)
    pub const UPROJECT_BLOCKING: &[ProcessDefinition] = &[ProcessDefinition {
        id: "unreal_engine",
        display_name: "Unreal Engine",
        patterns: &["UnrealEditor", "UE4Editor"],
    }];

    /// All known process groups - extend when adding new features
    pub fn get_group(group_name: &str) -> Option<&'static [ProcessDefinition]> {
        match group_name {
            "regenerate" => Some(REGENERATE_BLOCKING),
            "umap" => Some(UMAP_BLOCKING),
            "uproject" => Some(UPROJECT_BLOCKING),
            _ => None,
        }
    }
}

/// Check if any process name matches the given patterns (case-insensitive)
fn process_matches_patterns(process_name: &str, patterns: &[&str]) -> bool {
    let name_lower = process_name.to_lowercase();
    patterns
        .iter()
        .any(|p| name_lower.contains(&p.to_lowercase()))
}

/// Get process status for a feature group.
/// Returns status for each process in the group.
#[tauri::command]
pub fn get_process_status(group_name: String) -> Result<Vec<ProcessStatus>, String> {
    let definitions = process_groups::get_group(&group_name)
        .ok_or_else(|| format!("Unknown process group: {}", group_name))?;

    let mut sys = System::new_all();
    sys.refresh_all();

    let mut results = Vec::with_capacity(definitions.len());
    for def in definitions {
        let mut pids: Vec<u32> = Vec::new();
        for (pid, process) in sys.processes() {
            let name = process.name().to_string_lossy();
            if process_matches_patterns(&name, def.patterns) {
                pids.push(pid.as_u32());
            }
        }
        results.push(ProcessStatus {
            id: def.id.to_string(),
            display_name: def.display_name.to_string(),
            is_running: !pids.is_empty(),
            pids,
        });
    }
    Ok(results)
}

/// Check if any process in the given group is running.
/// Convenience for features that only need a boolean.
#[tauri::command]
pub fn has_blocking_processes(group_name: String) -> Result<bool, String> {
    let statuses = get_process_status(group_name)?;
    Ok(statuses.iter().any(|s| s.is_running))
}
