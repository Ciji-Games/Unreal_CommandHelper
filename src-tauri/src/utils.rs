//! Utility functions for process management and string handling

use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Strip ANSI escape codes from a string (for log output)
pub fn strip_ansi(s: &str) -> String {
    let ansi_escape = regex::Regex::new(r"\x1b\[[0-9;]*m").unwrap();
    ansi_escape.replace_all(s, "").to_string()
}

/// Build a command with CREATE_NO_WINDOW on Windows (avoids console flash)
#[cfg(windows)]
pub fn build_cmd(command: &str, args: &[String], cwd: Option<&str>) -> Command {
    let mut cmd = Command::new(command);
    cmd.args(args);
    if let Some(cwd) = cwd {
        cmd.current_dir(cwd);
    }
    // CREATE_NO_WINDOW = 0x0800_0000
    cmd.creation_flags(0x0800_0000u32);
    cmd
}

/// Build a command (non-Windows)
#[cfg(not(windows))]
pub fn build_cmd(command: &str, args: &[String], cwd: Option<&str>) -> Command {
    let mut cmd = Command::new(command);
    cmd.args(args);
    if let Some(cwd) = cwd {
        cmd.current_dir(cwd);
    }
    cmd
}

/// Kill a process by PID using taskkill on Windows
#[cfg(windows)]
pub fn kill_pid(pid: u32) -> Result<(), String> {
    let output = std::process::Command::new("taskkill")
        .args(["/T", "/F", "/PID", &pid.to_string()])
        .creation_flags(0x0800_0000u32)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

/// Kill a process by PID (non-Windows)
#[cfg(not(windows))]
pub fn kill_pid(pid: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::process::Command;
        Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
