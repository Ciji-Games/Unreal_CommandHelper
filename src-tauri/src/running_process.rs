//! Tracks the currently running process PID so the Stop button can terminate it.
//! Uses taskkill /T /F on Windows to kill the process tree (parent + children).

use std::sync::atomic::{AtomicU32, Ordering};

static RUNNING_PID: AtomicU32 = AtomicU32::new(0);

/// Register a process PID for the Stop button. Call after spawning a child process.
pub fn set_running_pid(pid: u32) {
    RUNNING_PID.store(pid, Ordering::SeqCst);
}

/// Clear the running PID. Call when the process exits (normally or after kill).
pub fn clear_running_pid() {
    RUNNING_PID.store(0, Ordering::SeqCst);
}

/// Get the current running PID and clear it. Returns None if no process is running.
pub fn take_running_pid() -> Option<u32> {
    let pid = RUNNING_PID.swap(0, Ordering::SeqCst);
    if pid == 0 {
        None
    } else {
        Some(pid)
    }
}
