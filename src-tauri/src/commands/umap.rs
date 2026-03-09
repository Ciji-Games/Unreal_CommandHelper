//! UMap Helper command - run WorldPartitionBuilderCommandlet for HLOD, MiniMap, Delete HLOD,
//! and ResavePackages for Build Static Lighting.
//! Step 11: Mirrors UmapHelper.cs RunMapCommand

use std::io::BufRead;
use std::path::Path;

use tauri::{AppHandle, Emitter};

use crate::commands::monitor;
use crate::utils::{build_cmd, strip_ansi};
#[cfg(windows)]
use crate::utils::spawn_minimized;

/// Log line color - matches regenerate.rs
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LogEvent {
    line: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<String>,
}

fn emit_log(app: &AppHandle, line: &str, explicit_color: Option<&str>) {
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
        line: strip_ansi(line),
        color,
    });
}

/// Progress update event for frontend
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    pub percent: u32,
}

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
        emit_log(&app, "[ERROR] UnrealEditor.exe not found.", Some("red"));
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

    emit_log(
        &app,
        &format!("Running {} for map: {}", builder, map_path),
        Some("blue"),
    );
    emit_log(
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
            let (mut child, stdout, stderr) = {
                spawn_minimized(&engine_path, &args, &cwd)?
            };

            #[cfg(not(windows))]
            let (mut child, stdout, stderr) = {
                let mut cmd = build_cmd(&engine_path, &args, Some(cwd.as_str()));
                cmd.stdout(std::process::Stdio::piped());
                cmd.stderr(std::process::Stdio::piped());
                let mut c = cmd.spawn().map_err(|e| e.to_string())?;
                let so = c.stdout.take().ok_or("Failed to capture stdout")?;
                let se = c.stderr.take().ok_or("Failed to capture stderr")?;
                (c, so, se)
            };
            let app_stdout = app.clone();
            let app_stderr = app.clone();

            // Parse progress from stdout: [N / M] Building HLOD actor (or similar)
            let progress_regex = regex::Regex::new(r"\[(\d+)\s*/\s*(\d+)\]")
                .expect("invalid regex");

            std::thread::spawn(move || {
                let reader = std::io::BufReader::new(stdout);
                for line in reader.lines().filter_map(Result::ok) {
                    if line.is_empty() {
                        continue;
                    }
                    let stripped = strip_ansi(&line);
                    if let Some(caps) = progress_regex.captures(&stripped) {
                        let current: u32 = caps.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
                        let total: u32 = caps.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(1);
                        let percent = if total > 0 {
                            ((current as f64 / total as f64) * 100.0) as u32
                        } else {
                            0
                        };
                        let _ = app_stdout.emit("progress-update", ProgressEvent { percent });
                    }
                    let _ = app_stdout.emit(
                        "log-output",
                        LogEvent {
                            line: stripped,
                            color: None,
                        },
                    );
                }
            });
            std::thread::spawn(move || {
                let reader = std::io::BufReader::new(stderr);
                for line in reader.lines().filter_map(Result::ok) {
                    if !line.is_empty() {
                        let _ = app_stderr.emit(
                            "log-output",
                            LogEvent {
                                line: strip_ansi(&line),
                                color: Some("red".to_string()),
                            },
                        );
                    }
                }
            });

            #[cfg(windows)]
            child.wait()?;
            #[cfg(not(windows))]
            {
                child.wait().map_err(|e| e.to_string())?;
            }
            Ok(())
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    result?;

    emit_log(&app, "HLOD generation completed.", Some("green"));

    if launch_map_after {
        emit_log(&app, &format!("Launching editor with map: {}", map_path), Some("blue"));
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
        emit_log(&app, "[ERROR] UnrealEditor.exe not found.", Some("red"));
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

    emit_log(
        &app,
        &format!("Running Build Static Lighting for map: {}", map_path),
        Some("blue"),
    );
    emit_log(
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
            let (mut child, stdout, stderr) = {
                spawn_minimized(&engine_path, &args, &cwd)?
            };

            #[cfg(not(windows))]
            let (mut child, stdout, stderr) = {
                let mut cmd = build_cmd(&engine_path, &args, Some(cwd.as_str()));
                cmd.stdout(std::process::Stdio::piped());
                cmd.stderr(std::process::Stdio::piped());
                let mut c = cmd.spawn().map_err(|e| e.to_string())?;
                let so = c.stdout.take().ok_or("Failed to capture stdout")?;
                let se = c.stderr.take().ok_or("Failed to capture stderr")?;
                (c, so, se)
            };

            let app_stdout = app.clone();
            let app_stderr = app.clone();

            std::thread::spawn(move || {
                let reader = std::io::BufReader::new(stdout);
                for line in reader.lines().filter_map(Result::ok) {
                    if !line.is_empty() {
                        emit_log(&app_stdout, &line, None);
                    }
                }
            });
            std::thread::spawn(move || {
                let reader = std::io::BufReader::new(stderr);
                for line in reader.lines().filter_map(Result::ok) {
                    if !line.is_empty() {
                        emit_log(&app_stderr, &line, Some("red"));
                    }
                }
            });

            #[cfg(windows)]
            child.wait()?;
            #[cfg(not(windows))]
            {
                child.wait().map_err(|e| e.to_string())?;
            }
            Ok(())
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    result?;

    emit_log(&app, "Build Static Lighting completed.", Some("green"));

    Ok(())
}
