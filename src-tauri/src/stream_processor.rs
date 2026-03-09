//! Shared stdout/stderr stream processor with progress parsing.
//! Used by all commands that spawn processes and emit log + progress.

use std::io::BufRead;

use tauri::{AppHandle, Emitter};

use crate::progress_parser::{self, ProgressState, ToolMode};
use crate::utils::strip_ansi;

/// Emit a progress update to frontend. Used for phases without process output (e.g. sync cleanup).
pub fn emit_progress(app: &AppHandle, percent: u32, elapsed_ms: u64) {
    let update = progress_parser::ProgressUpdate {
        percent,
        elapsed_ms,
        phase_name: None,
        current_step: None,
        total_steps: None,
    };
    let _ = app.emit("progress-update", update);
}

/// Log event for frontend - matches commands
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LogEvent {
    line: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<String>,
}

/// Emit a log line to frontend. Exported for commands to use for pre/post process messages.
pub fn emit_log(app: &AppHandle, line: &str, explicit_color: Option<&str>) {
    let color = explicit_color.map(String::from).or_else(|| {
        let lower = line.to_lowercase();
        if lower.contains("success") || lower.contains("completed") {
            Some("green".to_string())
        } else if lower.contains("error") && !lower.contains("warningsaserrors") {
            Some("red".to_string())
        } else if lower.contains("warning") {
            Some("orange".to_string())
        } else {
            None
        }
    });
    let _ = app.emit("log-output", LogEvent {
        line: line.to_string(),
        color,
    });
}

/// Spawn threads to process stdout and stderr. Call this after spawning a process.
/// Stdout is parsed for progress; both streams emit log-output.
pub fn process_streams<R, S>(stdout: R, stderr: S, app: AppHandle, tool_mode: ToolMode)
where
    R: BufRead + Send + 'static,
    S: BufRead + Send + 'static,
{
    let app_stdout = app.clone();
    let app_stderr = app.clone();

    std::thread::spawn(move || {
        let mut state = ProgressState::new(tool_mode);
        for line in stdout.lines().filter_map(Result::ok) {
            if line.is_empty() {
                continue;
            }
            let stripped = strip_ansi(&line);
            if let Some(update) = progress_parser::parse_line(&stripped, &mut state) {
                let _ = app_stdout.emit("progress-update", update);
            }
            emit_log(&app_stdout, &stripped, None);
        }
    });

    std::thread::spawn(move || {
        for line in stderr.lines().filter_map(Result::ok) {
            if !line.is_empty() {
                emit_log(&app_stderr, &strip_ansi(&line), Some("red"));
            }
        }
    });
}
