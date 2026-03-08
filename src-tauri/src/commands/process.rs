//! Process utilities - spawn, kill, run_command, open_file
//! Reuses pattern from webdev launcher

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::utils::{build_cmd, kill_pid};

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
pub fn run_command(
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    let cwd_ref = cwd.as_deref();
    let mut cmd = build_cmd(&command, &args, cwd_ref);
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn kill_process(pid: u32) -> Result<(), String> {
    kill_pid(pid)
}
