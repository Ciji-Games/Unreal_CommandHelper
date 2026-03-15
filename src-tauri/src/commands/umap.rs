//! UMap Helper command - run WorldPartitionBuilderCommandlet for HLOD, MiniMap, Delete HLOD,
//! and ResavePackages for Build Static Lighting.
//! Step 11: Mirrors UmapHelper.cs RunMapCommand

use std::path::Path;

use tauri::AppHandle;

use crate::commands::monitor;
use crate::progress_parser::ToolMode;
use crate::running_process;
use crate::stream_processor::{self, process_streams};
use crate::utils::build_cmd;
#[cfg(windows)]
use crate::utils::spawn_minimized;

/// Run WorldPartitionBuilderCommandlet for the selected project/map.
/// Working directory: parent of engine_path (Engine/Binaries/Win64).
#[tauri::command]
pub async fn run_map_command(
    project_path: String,
    map_path: String,
    builder: String,
    extra_args: Option<String>,
    engine_path: String,
    launch_map_after: bool,
    app: AppHandle,
) -> Result<(), String> {
    if monitor::has_blocking_processes("umap".to_string())? {
        return Err(
            "Cannot run map command: Unreal Engine is running. Close it first.".to_string(),
        );
    }

    let engine_exe = Path::new(&engine_path);
    if !engine_exe.exists() {
        stream_processor::emit_log(&app, "[ERROR] UnrealEditor.exe not found.", Some("red"));
        return Err("Engine path not found".to_string());
    }

    let cwd: String = engine_exe
        .parent()
        .and_then(|p| p.to_str())
        .filter(|s| !s.is_empty())
        .ok_or("Invalid engine path")?
        .to_string();

    let mut args = vec![
        project_path.clone(),
        map_path.clone(),
        "-run=WorldPartitionBuilderCommandlet".to_string(),
        "-AllowCommandletRendering".to_string(),
        format!("-builder={}", builder),
        "-Unattended".to_string(),        // Suppress dialogs, run headless
        "-RenderOffscreen".to_string(),   // Disable window rendering, render offscreen (GPU required)
    ];
    if let Some(ref extra) = extra_args {
        if !extra.is_empty() {
            args.push(extra.clone());
        }
    }
    args.push("-log".to_string());

    let tool_mode = if extra_args.as_deref() == Some("-DeleteHLODs") {
        ToolMode::DeleteHlod
    } else if builder == "WorldPartitionMiniMapBuilder" {
        ToolMode::BuildMiniMap
    } else if builder == "WorldPartitionHLODsBuilder" {
        ToolMode::BuildHlod
    } else {
        // ResaveActors, Foliage, NavigationData, RenameDuplicate - use Generic to parse [N/M] patterns
        ToolMode::Generic
    };

    stream_processor::emit_log(
        &app,
        &format!("Running {} for map: {}", builder, map_path),
        Some("blue"),
    );
    stream_processor::emit_log(
        &app,
        &format!("Command: {} {}", engine_path, args.join(" ")),
        Some("gray"),
    );

    let result = tokio::task::spawn_blocking({
        let app = app.clone();
        let engine_path = engine_path.clone();
        let cwd = cwd.clone();
        let args = args.clone();
        move || -> Result<(), String> {
            #[cfg(windows)]
            let (mut child, stdout, stderr, pid) = {
                let (c, so, se, p) = spawn_minimized(&engine_path, &args, &cwd)?;
                (c, so, se, p)
            };

            #[cfg(not(windows))]
            let (mut child, stdout, stderr, pid) = {
                let mut cmd = build_cmd(&engine_path, &args, Some(cwd.as_str()));
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
            process_streams(stdout_reader, stderr_reader, app.clone(), tool_mode);

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

    stream_processor::emit_log(&app, "HLOD generation completed.", Some("green"));

    if launch_map_after {
        stream_processor::emit_log(&app, &format!("Launching editor with map: {}", map_path), Some("blue"));
        let launch_args = vec![project_path.clone(), map_path.clone()];
        let mut launch_cmd = build_cmd(&engine_path, &launch_args, Some(&cwd));
        let _ = launch_cmd.spawn();
    }

    Ok(())
}

/// Run ResavePackages commandlet with -BuildLighting for static lighting.
/// Working directory: parent of engine_path (Engine/Binaries/Win64).
/// No launch_map_after - lighting build completes and exits.
#[tauri::command]
pub async fn run_build_lighting(
    project_path: String,
    map_path: String,
    engine_path: String,
    quality: Option<String>,
    app: AppHandle,
) -> Result<(), String> {
    if monitor::has_blocking_processes("umap".to_string())? {
        return Err(
            "Cannot run build lighting: Unreal Engine is running. Close it first.".to_string(),
        );
    }

    let engine_exe = Path::new(&engine_path);
    if !engine_exe.exists() {
        stream_processor::emit_log(&app, "[ERROR] UnrealEditor.exe not found.", Some("red"));
        return Err("Engine path not found".to_string());
    }

    let cwd: String = engine_exe
        .parent()
        .and_then(|p| p.to_str())
        .filter(|s| !s.is_empty())
        .ok_or("Invalid engine path")?
        .to_string();

    let mut args = vec![
        project_path.clone(),
        "-run=ResavePackages".to_string(),
        "-BuildLighting".to_string(),
        "-AllowCommandletRendering".to_string(),
        format!("-map={}", map_path),
        "-Unattended".to_string(),
        "-log".to_string(),
    ];
    if let Some(ref q) = quality {
        if !q.is_empty() {
            args.push(format!("-Quality={}", q));
        }
    }

    stream_processor::emit_log(
        &app,
        &format!("Running Build Static Lighting for map: {}", map_path),
        Some("blue"),
    );
    stream_processor::emit_log(
        &app,
        &format!("Command: {} {}", engine_path, args.join(" ")),
        Some("gray"),
    );

    let result = tokio::task::spawn_blocking({
        let app = app.clone();
        let engine_path = engine_path.clone();
        let cwd = cwd.clone();
        let args = args.clone();
        move || -> Result<(), String> {
            #[cfg(windows)]
            let (mut child, stdout, stderr, pid) = {
                let (c, so, se, p) = spawn_minimized(&engine_path, &args, &cwd)?;
                (c, so, se, p)
            };

            #[cfg(not(windows))]
            let (mut child, stdout, stderr, pid) = {
                let mut cmd = build_cmd(&engine_path, &args, Some(cwd.as_str()));
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

    stream_processor::emit_log(&app, "Build Static Lighting completed.", Some("green"));

    Ok(())
}
