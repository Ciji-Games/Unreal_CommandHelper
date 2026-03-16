//! Process utilities - spawn, kill, run_command, open_file
//! Reuses pattern from webdev launcher

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::AppHandle;

use crate::running_process;
use crate::stream_processor;
use crate::utils::{build_cmd, kill_pid};

/// Stop the currently running tool (Cook, Package, Build, etc.).
/// Uses taskkill /T /F to terminate the process and its child tree.
#[tauri::command]
pub fn stop_running_process(app: AppHandle) -> Result<(), String> {
    let pid = running_process::take_running_pid().ok_or("No process is currently running.")?;
    kill_pid(pid)?;
    stream_processor::emit_log(&app, "Process stopped by user.", Some("orange"));
    stream_processor::emit_progress(&app, 100, 0);
    Ok(())
}

/// Launch a project with a specific map. Spawns UnrealEditor.exe with project_path and map_path.
/// Uses cmd /c start so the editor opens in a visible window.
#[tauri::command]
pub fn launch_project_with_map(
    project_path: String,
    map_path: String,
    engine_path: String,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        if engine_path == "Unknown" || !std::path::Path::new(&engine_path).exists() {
            return Err(
                "Engine path not found. Ensure the project uses an installed engine.".to_string(),
            );
        }
        // start "" "exe" "arg1" "arg2" - empty title, then exe and args
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &engine_path, &project_path, &map_path])
            .creation_flags(0x0800_0000u32) // CREATE_NO_WINDOW for cmd
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = (project_path, map_path, engine_path);
        return Err("launch_project_with_map is only supported on Windows".to_string());
    }
    Ok(())
}

/// Open a file with the default application (e.g. .uproject → UnrealVersionSelector, .sln → VS/Rider).
/// Uses shell association on Windows.
#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .creation_flags(0x0800_0000u32) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        return Err("open_file is only supported on Windows".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn run_command(command: String, args: Vec<String>, cwd: Option<String>) -> Result<(), String> {
    let cwd_ref = cwd.as_deref();
    let mut cmd = build_cmd(&command, &args, cwd_ref);
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn kill_process(pid: u32) -> Result<(), String> {
    kill_pid(pid)
}
