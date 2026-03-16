//! Movie Render Queue - command-line rendering with UnrealEditor-Cmd.exe.
//! See: https://dev.epicgames.com/community/learning/tutorials/nZ2e/command-line-rendering-with-unreal-engine-movie-render-queue

use std::path::Path;

use tauri::AppHandle;

use crate::commands::monitor;
use crate::commands::registry;
use crate::progress_parser::ToolMode;
use crate::running_process;
use crate::stream_processor::{self, process_streams};
#[cfg(not(windows))]
use crate::utils::build_cmd;
#[cfg(windows)]
use crate::utils::spawn_minimized;

/// Run Movie Render Queue via command line.
/// Uses UnrealEditor-Cmd.exe with -game, -MoviePipelineConfig, and optionally -LevelSequence.
#[tauri::command]
pub async fn run_movie_render_queue(
    project_path: String,
    map_path: String,
    movie_pipeline_config: String,
    level_sequence: Option<String>,
    engine_path: String,
    app: AppHandle,
) -> Result<(), String> {
    if monitor::has_blocking_processes("uproject".to_string())? {
        return Err(
            "Cannot run Movie Render Queue: Unreal Engine is running. Close it first.".to_string(),
        );
    }

    let editor_exe = Path::new(&engine_path);
    if !editor_exe.exists() {
        stream_processor::emit_log(&app, "[ERROR] Editor executable not found.", Some("red"));
        return Err("Engine path not found".to_string());
    }

    let editor_cmd = registry::get_editor_cmd_path(editor_exe)
        .ok_or("Invalid engine path")?
        .to_string_lossy()
        .to_string();
    if !Path::new(&editor_cmd).exists() {
        return Err("Editor command-line executable not found (UnrealEditor-Cmd.exe or UE4Editor-Cmd.exe)".to_string());
    }

    let bin_dir = editor_exe.parent().ok_or("Invalid engine path")?;

    let cwd = bin_dir.to_str().ok_or("Invalid Binaries path")?.to_string();

    let mut args = vec![project_path.clone(), map_path.clone(), "-game".to_string()];

    if let Some(ref seq) = level_sequence {
        if !seq.is_empty() {
            args.push(format!("-LevelSequence={}", seq));
        }
    }

    args.push(format!("-MoviePipelineConfig={}", movie_pipeline_config));
    args.push("-windowed".to_string());
    args.push("-Log".to_string());
    args.push("-StdOut".to_string());
    args.push("-allowStdOutLogVerbosity".to_string());
    args.push("-Unattended".to_string());

    stream_processor::emit_log(&app, "Running Movie Render Queue...", Some("blue"));
    stream_processor::emit_log(
        &app,
        &format!("Command: {} {}", editor_cmd, args.join(" ")),
        Some("gray"),
    );

    let result = tokio::task::spawn_blocking({
        let app = app.clone();
        let editor_cmd = editor_cmd.clone();
        let cwd = cwd.clone();
        let args = args.clone();
        move || -> Result<(), String> {
            #[cfg(windows)]
            let (mut child, stdout, stderr, pid) = {
                let (c, so, se, p) = spawn_minimized(&editor_cmd, &args, &cwd)?;
                (c, so, se, p)
            };

            #[cfg(not(windows))]
            let (mut child, stdout, stderr, pid) = {
                let mut cmd = build_cmd(&editor_cmd, &args, Some(cwd.as_str()));
                cmd.stdout(std::process::Stdio::piped());
                cmd.stderr(std::process::Stdio::piped());
                let mut c = cmd.spawn().map_err(|e| e.to_string())?;
                let pid = c.id();
                let so = c.stdout.take().ok_or("Failed to capture stdout")?;
                let se = c.stderr.take().ok_or("Failed to capture stderr")?;
                (c, so, se, pid)
            };

            running_process::set_running_pid(pid);
            let stdout_reader = std::io::BufReader::new(stdout);
            let stderr_reader = std::io::BufReader::new(stderr);
            process_streams(stdout_reader, stderr_reader, app.clone(), ToolMode::Generic);

            #[cfg(windows)]
            child.wait()?;
            #[cfg(not(windows))]
            {
                child.wait().map_err(|e| e.to_string())?;
            }
            running_process::clear_running_pid();
            Ok(())
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    result?;

    stream_processor::emit_log(&app, "Movie Render Queue completed.", Some("green"));

    Ok(())
}
