//! Regenerate project command - nuke solution, delete cache/build, run UnrealVersionSelector.
//! Step 8: Mirrors RegenerateProject.cs metroSetButton1_Click

use std::path::Path;

use tauri::{AppHandle, Emitter};

use crate::utils::{build_cmd, strip_ansi};

/// Log line color - matches old launcher (CustomGroup.cs, Form1.AppendLog)
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEvent {
    pub line: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

/// Emit a log line to the frontend. Color matches old launcher:
/// - Green: Success, Completed
/// - Red: Error (also stderr)
/// - Orange: Warning
/// - Blue: Info (explicit)
/// - White: Default
fn emit_log(app: &AppHandle, line: &str, explicit_color: Option<&str>) {
    let color = explicit_color.map(String::from).or_else(|| {
        let lower = line.to_lowercase();
        if lower.contains("success") || lower.contains("completed") {
            Some("green".to_string())
        } else if lower.contains("error") {
            Some("red".to_string())
        } else if lower.contains("warning") {
            Some("orange".to_string())
        } else {
            None // white/default
        }
    });
    let _ = app.emit("log-output", LogEvent {
        line: strip_ansi(line),
        color,
    });
}

/// Regenerate project files: delete Intermediate, DerivedDataCache, Build, .vs, Binaries,
/// .sln, .vsconfig; then run UnrealVersionSelector -projectfiles.
/// Optionally build the project (Development Editor) so VS and UE recognize it as compiled.
#[tauri::command]
pub async fn regenerate_project(
    uproject_path: String,
    open_project_after: bool,
    open_sln_after: bool,
    build_after: bool,
    version_selector_path: String,
    engine_install_path: String,
    app: AppHandle,
) -> Result<(), String> {
    let uproj = Path::new(&uproject_path);
    if !uproj.exists() || uproj.extension().map_or(true, |e| e != "uproject") {
        return Err("Invalid or missing .uproject file".to_string());
    }

    let project_dir = uproj
        .parent()
        .ok_or("Invalid project path")?
        .to_path_buf();
    if !project_dir.join("Source").exists() {
        return Err("Regenerate is only for C++ projects (requires Source folder). This project has no C++ code.".to_string());
    }
    let project_name = uproj
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    if !Path::new(&version_selector_path).exists() {
        emit_log(&app, "[ERROR] UnrealVersionSelector.exe not found.", Some("red"));
        return Err("UnrealVersionSelector.exe not found".to_string());
    }

    let result = tokio::task::spawn_blocking({
        let app = app.clone();
        let uproject_path = uproject_path.clone();
        let version_selector_path = version_selector_path.clone();
        let project_dir = project_dir.clone();
        let project_name = project_name.clone();
        move || -> Result<(), String> {
            // 1. Delete folders
            let folders = ["Intermediate", "DerivedDataCache", "Build", ".vs", "Binaries"];
            for folder in folders {
                let folder_path = project_dir.join(folder);
                if folder_path.exists() {
                    match std::fs::remove_dir_all(&folder_path) {
                        Ok(()) => emit_log(&app, &format!("Deleted folder: {}", folder), Some("blue")),
                        Err(e) => emit_log(
                            &app,
                            &format!("[ERROR] Could not delete {}: {}", folder, e),
                            Some("red"),
                        ),
                    }
                }
            }

            // 2. Delete .sln and .vsconfig (correct path: same dir as .uproject, stem.sln)
            let sln_path = project_dir.join(format!("{}.sln", project_name.as_str()));
            let vsconfig_path = project_dir.join(".vsconfig");
            for (path, label) in [
                (sln_path, "solution file"),
                (vsconfig_path, ".vsconfig"),
            ] {
                if path.exists() {
                    match std::fs::remove_file(&path) {
                        Ok(()) => emit_log(
                            &app,
                            &format!("Deleted file: {}", path.file_name().unwrap_or_default().to_string_lossy()),
                            Some("blue"),
                        ),
                        Err(e) => emit_log(
                            &app,
                            &format!("[ERROR] Could not delete {}: {}", label, e),
                            Some("red"),
                        ),
                    }
                }
            }

            emit_log(&app, "Cleaning completed.", Some("blue"));

            // 3. Run UnrealVersionSelector -projectfiles
            emit_log(&app, "Generating project files...", Some("blue"));
            let args = vec!["-projectfiles".to_string(), uproject_path.clone()];
            let cwd = project_dir.to_str().filter(|s| !s.is_empty());
            let mut cmd = build_cmd(&version_selector_path, &args, cwd);
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());

            let mut child = cmd.spawn().map_err(|e| e.to_string())?;
            let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
            let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
            let app_stdout = app.clone();
            let app_stderr = app.clone();

            std::thread::spawn(move || {
                use std::io::BufRead;
                let reader = std::io::BufReader::new(stdout);
                for line in reader.lines().filter_map(Result::ok) {
                    if !line.is_empty() {
                        emit_log(&app_stdout, &line, None);
                    }
                }
            });
            std::thread::spawn(move || {
                use std::io::BufRead;
                let reader = std::io::BufReader::new(stderr);
                for line in reader.lines().filter_map(Result::ok) {
                    if !line.is_empty() {
                        emit_log(&app_stderr, &line, Some("red"));
                    }
                }
            });

            child.wait().map_err(|e| e.to_string())?;
            Ok(())
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    result?;

    emit_log(&app, "Project files generated!", Some("green"));

    // 4. Optional: build project (Development Editor) so VS and UE recognize it as compiled
    if build_after && !engine_install_path.is_empty() {
        let editor_path = Path::new(&engine_install_path);
        if editor_path.exists() {
            // Engine root: UnrealEditor.exe is at Engine/Binaries/Win64/UnrealEditor.exe
            let engine_root = editor_path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .and_then(|p| p.parent());
            if let Some(engine_root) = engine_root {
                let build_bat = engine_root
                    .join("Engine")
                    .join("Build")
                    .join("BatchFiles")
                    .join("Build.bat");
                if build_bat.exists() {
                    let target = format!("{}Editor", project_name);
                    let build_result = tokio::task::spawn_blocking({
                        let app = app.clone();
                        let uproject_path = uproject_path.clone();
                        let build_bat = build_bat.to_path_buf();
                        let target = target.clone();
                        move || -> Result<(), String> {
                            emit_log(&app, "Building project (Development Editor)...", Some("blue"));
                            // Run Build.bat from its directory to avoid path-with-spaces issues
                            let batch_dir = build_bat.parent().ok_or("Invalid Build.bat path")?;
                            let cwd = batch_dir.to_str().ok_or("Invalid BatchFiles path")?;
                            let args = vec![
                                "/c".to_string(),
                                "Build.bat".to_string(),
                                target,
                                "Win64".to_string(),
                                "Development".to_string(),
                                "-Project".to_string(),
                                uproject_path.clone(),
                                "-WaitMutex".to_string(),
                            ];
                            let mut cmd = build_cmd("cmd", &args, Some(cwd));
                            cmd.stdout(std::process::Stdio::piped());
                            cmd.stderr(std::process::Stdio::piped());

                            let mut child = cmd.spawn().map_err(|e| e.to_string())?;
                            let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
                            let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
                            let app_stdout = app.clone();
                            let app_stderr = app.clone();

                            std::thread::spawn(move || {
                                use std::io::BufRead;
                                let reader = std::io::BufReader::new(stdout);
                                for line in reader.lines().filter_map(Result::ok) {
                                    if !line.is_empty() {
                                        emit_log(&app_stdout, &line, None);
                                    }
                                }
                            });
                            std::thread::spawn(move || {
                                use std::io::BufRead;
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

                    if let Err(e) = build_result {
                        return Err(e);
                    }
                } else {
                    emit_log(
                        &app,
                        "[WARNING] Build.bat not found. Skipping build.",
                        Some("orange"),
                    );
                }
            } else {
                emit_log(
                    &app,
                    "[WARNING] Could not resolve engine root. Skipping build.",
                    Some("orange"),
                );
            }
        } else {
            emit_log(
                &app,
                "[WARNING] Engine path not found. Skipping build.",
                Some("orange"),
            );
        }
    }

    // 5. Optional: open project or .sln after
    if open_project_after {
        emit_log(&app, "Opening project...", Some("blue"));
        let _ = crate::commands::process::open_file(uproject_path.clone());
    }
    if open_sln_after {
        let sln_path = project_dir.join(format!("{}.sln", project_name.as_str()));
        if sln_path.exists() {
            emit_log(&app, "Opening solution...", Some("blue"));
            let _ = crate::commands::process::open_file(sln_path.to_string_lossy().to_string());
        } else {
            emit_log(&app, "[ERROR] .sln file not found after generation.", Some("red"));
        }
    }

    Ok(())
}
