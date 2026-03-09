//! UProject Helper - Cook, Package (BuildCookRun), Build (Compile only).
//! Step 13: Cook Content, Package, Build commands.

use std::io::BufRead;
use std::path::Path;

use tauri::{AppHandle, Emitter};

use crate::commands::monitor;
use crate::utils::{build_cmd, strip_ansi};

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

/// Resolve engine root from UnrealEditor.exe path.
/// UnrealEditor.exe is at Engine/Binaries/Win64/UnrealEditor.exe
/// Engine root = parent of Engine folder = parent x4 from exe.
fn editor_path_to_engine_root(editor_path: &str) -> Option<std::path::PathBuf> {
    let mut p = Path::new(editor_path).to_path_buf();
    for _ in 0..4 {
        p = p.parent()?.to_path_buf();
    }
    Some(p)
}

/// Map UI platform (Win64, Linux, Mac) to Unreal cook target platform.
/// TargetPlatformManager expects Windows/Linux/Mac, not Win64.
fn platform_for_cook(platform: &str) -> &str {
    match platform {
        "Win64" => "Windows",
        _ => platform,
    }
}

/// Cook content: UnrealEditor-Cmd.exe "project.uproject" -run=cook -targetplatform=Windows -iterate -unattended -log
#[tauri::command]
pub async fn run_cook(
    project_path: String,
    platform: String,
    engine_path: String,
    app: AppHandle,
) -> Result<(), String> {
    if monitor::has_blocking_processes("uproject".to_string())? {
        return Err(
            "Cannot cook: Unreal Engine is running. Close it first.".to_string(),
        );
    }

    let uproj = Path::new(&project_path);
    if !uproj.exists() || uproj.extension().map_or(true, |e| e != "uproject") {
        return Err("Invalid or missing .uproject file".to_string());
    }

    let editor_exe = Path::new(&engine_path);
    if !editor_exe.exists() {
        emit_log(&app, "[ERROR] UnrealEditor.exe not found.", Some("red"));
        return Err("Engine path not found".to_string());
    }

    // UnrealEditor-Cmd.exe is in same folder as UnrealEditor.exe
    let bin_dir = editor_exe.parent().ok_or("Invalid engine path")?;
    let editor_cmd = bin_dir
        .join("UnrealEditor-Cmd.exe")
        .to_string_lossy()
        .to_string();
    if !Path::new(&editor_cmd).exists() {
        return Err("UnrealEditor-Cmd.exe not found".to_string());
    }

    let cook_platform = platform_for_cook(&platform);
    let cwd = bin_dir.to_str().ok_or("Invalid Binaries path")?.to_string();
    let args = vec![
        project_path.clone(),
        "-run=cook".to_string(),
        format!("-targetplatform={}", cook_platform),
        "-iterate".to_string(),
        "-unattended".to_string(),
        "-log".to_string(),
    ];

    emit_log(&app, &format!("Running Cook for platform: {} (target: {})", platform, cook_platform), Some("blue"));
    emit_log(&app, &format!("Command: {} {}", editor_cmd, args.join(" ")), None);

    let result = tokio::task::spawn_blocking({
        let app = app.clone();
        let editor_cmd = editor_cmd.clone();
        let cwd = cwd.clone();
        let args = args.clone();
        move || -> Result<(), String> {
            let mut cmd = build_cmd(&editor_cmd, &args, Some(&cwd));
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());

            let mut child = cmd.spawn().map_err(|e| e.to_string())?;
            let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
            let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
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

            let status = child.wait().map_err(|e| e.to_string())?;
            if status.success() {
                emit_log(&app, "Cook completed successfully!", Some("green"));
                Ok(())
            } else {
                emit_log(
                    &app,
                    &format!("Cook exited with code: {:?}", status.code()),
                    Some("red"),
                );
                Err("Cook failed".to_string())
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    result
}

/// Package (BuildCookRun): RunUAT.bat BuildCookRun -project="path" -platform=Win64 -clientconfig=Development -build -cook -stage -pak -archive -archivedirectory="..."
#[tauri::command]
pub async fn run_package(
    project_path: String,
    platform: String,
    client_config: String,
    archive_directory: String,
    engine_path: String,
    app: AppHandle,
) -> Result<(), String> {
    if monitor::has_blocking_processes("uproject".to_string())? {
        return Err(
            "Cannot package: Unreal Engine is running. Close it first.".to_string(),
        );
    }

    let uproj = Path::new(&project_path);
    if !uproj.exists() || uproj.extension().map_or(true, |e| e != "uproject") {
        return Err("Invalid or missing .uproject file".to_string());
    }

    let engine_root = editor_path_to_engine_root(&engine_path)
        .ok_or("Could not resolve engine root from editor path")?;
    let run_uat = engine_root
        .join("Engine")
        .join("Build")
        .join("BatchFiles")
        .join("RunUAT.bat");
    if !run_uat.exists() {
        return Err(format!("RunUAT.bat not found at {:?}", run_uat));
    }

    let batch_dir = run_uat.parent().ok_or("Invalid RunUAT path")?;
    let cwd: String = batch_dir
        .to_str()
        .ok_or("Invalid BatchFiles path")?
        .to_string();

    let args = vec![
        "BuildCookRun".to_string(),
        format!("-project=\"{}\"", project_path),
        format!("-platform={}", platform),
        format!("-clientconfig={}", client_config),
        "-build".to_string(),
        "-cook".to_string(),
        "-stage".to_string(),
        "-pak".to_string(),
        "-archive".to_string(),
        format!("-archivedirectory=\"{}\"", archive_directory),
    ];

    emit_log(
        &app,
        &format!(
            "Running Package (BuildCookRun) for platform: {}, config: {}",
            platform, client_config
        ),
        Some("blue"),
    );
    emit_log(
        &app,
        &format!("Archive directory: {}", archive_directory),
        None,
    );

    let run_uat_str = run_uat.to_string_lossy().to_string();
    let result = tokio::task::spawn_blocking({
        let app = app.clone();
        let run_uat_str = run_uat_str.clone();
        let cwd = cwd.clone();
        let args = args.clone();
        move || -> Result<(), String> {
            let mut cmd = build_cmd(&run_uat_str, &args, Some(&cwd));
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());

            let mut child = cmd.spawn().map_err(|e| e.to_string())?;
            let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
            let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
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

            let status = child.wait().map_err(|e| e.to_string())?;
            if status.success() {
                emit_log(&app, "Package completed successfully!", Some("green"));
                Ok(())
            } else {
                emit_log(
                    &app,
                    &format!("Package exited with code: {:?}", status.code()),
                    Some("red"),
                );
                Err("Package failed".to_string())
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    result
}

/// Build (Compile only): Build.bat {ProjectName}Editor Win64 Development -Project="path" -WaitMutex
/// C++ only - returns Err if !is_cpp.
#[tauri::command]
pub async fn run_build(
    project_path: String,
    engine_path: String,
    is_cpp: bool,
    app: AppHandle,
) -> Result<(), String> {
    if !is_cpp {
        return Err("Build is only for C++ projects (requires Source folder). This project has no C++ code.".to_string());
    }

    if monitor::has_blocking_processes("uproject".to_string())? {
        return Err(
            "Cannot build: Unreal Engine is running. Close it first.".to_string(),
        );
    }

    let uproj = Path::new(&project_path);
    if !uproj.exists() || uproj.extension().map_or(true, |e| e != "uproject") {
        return Err("Invalid or missing .uproject file".to_string());
    }

    let project_name = uproj
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let engine_root = editor_path_to_engine_root(&engine_path)
        .ok_or("Could not resolve engine root from editor path")?;
    let build_bat = engine_root
        .join("Engine")
        .join("Build")
        .join("BatchFiles")
        .join("Build.bat");
    if !build_bat.exists() {
        return Err(format!("Build.bat not found at {:?}", build_bat));
    }

    let batch_dir = build_bat.parent().ok_or("Invalid Build.bat path")?;
    let cwd: String = batch_dir
        .to_str()
        .ok_or("Invalid BatchFiles path")?
        .to_string();

    let target = format!("{}Editor", project_name);
    let args = vec![
        "/c".to_string(),
        "Build.bat".to_string(),
        target,
        "Win64".to_string(),
        "Development".to_string(),
        "-Project".to_string(),
        project_path.clone(),
        "-WaitMutex".to_string(),
    ];

    emit_log(&app, "Building project (Development Editor)...", Some("blue"));
    emit_log(&app, &format!("Target: {}Editor", project_name), None);

    let result = tokio::task::spawn_blocking({
        let app = app.clone();
        let cwd = cwd.clone();
        let args = args.clone();
        move || -> Result<(), String> {
            let mut cmd = build_cmd("cmd", &args, Some(&cwd));
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());

            let mut child = cmd.spawn().map_err(|e| e.to_string())?;
            let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
            let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
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

            let status = child.wait().map_err(|e| e.to_string())?;
            if status.success() {
                emit_log(&app, "Build completed successfully!", Some("green"));
                Ok(())
            } else {
                emit_log(
                    &app,
                    &format!("Build exited with code: {:?}", status.code()),
                    Some("red"),
                );
                Err("Build failed".to_string())
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    result
}
