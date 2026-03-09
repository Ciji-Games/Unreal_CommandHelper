//! Utility functions for process management and string handling

use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use std::os::windows::io::FromRawHandle;

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

// --- Windows-only: spawn process with minimized window ---

#[cfg(windows)]
pub struct SpawnMinimizedChild {
    process_handle: windows::Win32::Foundation::HANDLE,
    thread_handle: windows::Win32::Foundation::HANDLE,
}

#[cfg(windows)]
impl SpawnMinimizedChild {
    pub fn wait(&mut self) -> Result<(), String> {
        use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
        use windows::Win32::System::Threading::{GetExitCodeProcess, WaitForSingleObject, INFINITE};

        unsafe {
            let r = WaitForSingleObject(self.process_handle, INFINITE);
            if r != WAIT_OBJECT_0 {
                let _ = CloseHandle(self.process_handle);
                let _ = CloseHandle(self.thread_handle);
                return Err("WaitForSingleObject failed".to_string());
            }
            let mut code: u32 = 0;
            GetExitCodeProcess(self.process_handle, &mut code)
                .map_err(|e| format!("GetExitCodeProcess: {}", e))?;
            let _ = CloseHandle(self.process_handle);
            let _ = CloseHandle(self.thread_handle);
            Ok(())
        }
    }
}

#[cfg(windows)]
impl Drop for SpawnMinimizedChild {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(self.process_handle);
            let _ = windows::Win32::Foundation::CloseHandle(self.thread_handle);
        }
    }
}

/// Spawn a process with minimized window on Windows. Uses CreateProcessW with STARTUPINFOW.
/// Returns (child, stdout pipe, stderr pipe, pid). Call child.wait() to block until process exits.
#[cfg(windows)]
pub fn spawn_minimized(
    exe: &str,
    args: &[String],
    cwd: &str,
) -> Result<(SpawnMinimizedChild, std::fs::File, std::fs::File, u32), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::Pipes::CreatePipe;
    use windows::Win32::System::Threading::{
        CreateProcessW, CREATE_UNICODE_ENVIRONMENT, PROCESS_INFORMATION, STARTF_USESHOWWINDOW,
        STARTF_USESTDHANDLES, STARTUPINFOW,
    };

    // Build command line: "exe" arg1 arg2 ...
    let cmd_line: Vec<u16> = {
        let mut s = format!("\"{}\"", exe);
        for arg in args {
            s.push(' ');
            if arg.contains(' ') || arg.contains('"') {
                s.push('"');
                s.push_str(&arg.replace('"', "\\\""));
                s.push('"');
            } else {
                s.push_str(arg);
            }
        }
        s.push('\0');
        s.encode_utf16().collect()
    };

    let mut stdout_read = HANDLE::default();
    let mut stdout_write = HANDLE::default();
    let mut stderr_read = HANDLE::default();
    let mut stderr_write = HANDLE::default();

    let sa = windows::Win32::Security::SECURITY_ATTRIBUTES {
        nLength: std::mem::size_of::<windows::Win32::Security::SECURITY_ATTRIBUTES>() as u32,
        bInheritHandle: true.into(),
        lpSecurityDescriptor: std::ptr::null_mut(),
    };

    unsafe {
        CreatePipe(&mut stdout_read, &mut stdout_write, Some(&sa), 0)
            .map_err(|e| format!("CreatePipe stdout: {}", e))?;
        CreatePipe(&mut stderr_read, &mut stderr_write, Some(&sa), 0)
            .map_err(|e| format!("CreatePipe stderr: {}", e))?;
    }

    let cwd_wide: Vec<u16> = std::ffi::OsStr::new(cwd)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut si: STARTUPINFOW = unsafe { std::mem::zeroed() };
    si.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
    si.dwFlags = STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES;
    si.wShowWindow = 6; // SW_SHOWMINIMIZED
    si.hStdOutput = stdout_write;
    si.hStdError = stderr_write;

    let mut pi = PROCESS_INFORMATION::default();

    unsafe {
        CreateProcessW(
            PCWSTR::null(),
            windows::core::PWSTR(cmd_line.as_ptr() as *mut u16),
            None,
            None,
            true,
            CREATE_UNICODE_ENVIRONMENT,
            None,
            PCWSTR(cwd_wide.as_ptr()),
            &si,
            &mut pi,
        )
        .map_err(|e| format!("CreateProcessW: {}", e))?;
    }

    unsafe {
        let _ = windows::Win32::Foundation::CloseHandle(stdout_write);
        let _ = windows::Win32::Foundation::CloseHandle(stderr_write);
    }

    let stdout_file = unsafe { std::fs::File::from_raw_handle(stdout_read.0 as *mut _) };
    let stderr_file = unsafe { std::fs::File::from_raw_handle(stderr_read.0 as *mut _) };

    let child = SpawnMinimizedChild {
        process_handle: pi.hProcess,
        thread_handle: pi.hThread,
    };
    let pid = pi.dwProcessId;

    Ok((child, stdout_file, stderr_file, pid))
}
