//! Process utilities - spawn, kill, run_command
//! Reuses pattern from webdev launcher

use crate::utils::{build_cmd, kill_pid};

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
