//! Regenerate project command - nuke solution, delete cache/build, run UnrealVersionSelector.
//! Step 8: Mirrors RegenerateProject.cs metroSetButton1_Click

use std::path::Path;
use std::time::Instant;

use tauri::AppHandle;

use crate::commands::monitor;
use crate::progress_parser::ToolMode;
use crate::running_process;
use crate::stream_processor::{self, process_streams};
use crate::utils::build_cmd;

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

    let project_dir = uproj.parent().ok_or("Invalid project path")?.to_path_buf();
    if !project_dir.join("Source").exists() {
        return Err("Regenerate is only for C++ projects (requires Source folder). This project has no C++ code.".to_string());
    }
    let project_name = uproj
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    if !Path::new(&version_selector_path).exists() {
        stream_processor::emit_log(
            &app,
            "[ERROR] UnrealVersionSelector.exe not found.",
            Some("red"),
        );
        return Err("UnrealVersionSelector.exe not found".to_string());
    }

    if monitor::has_blocking_processes("regenerate".to_string())? {
        return Err(
            "Cannot regenerate: Unreal Engine, Visual Studio, or JetBrains Rider is running. Close them first.".to_string(),
        );
    }

    let result = tokio::task::spawn_blocking({
        let app = app.clone();
        let uproject_path = uproject_path.clone();
        let version_selector_path = version_selector_path.clone();
        let project_dir = project_dir.clone();
        let project_name = project_name.clone();
        move || -> Result<(), String> {
            // 1. Delete folders
            let folders = [
                "Intermediate",
                "DerivedDataCache",
                "Build",
                ".vs",
                "Binaries",
            ];
            for folder in folders {
                let folder_path = project_dir.join(folder);
                if folder_path.exists() {
                    match std::fs::remove_dir_all(&folder_path) {
                        Ok(()) => stream_processor::emit_log(
                            &app,
                            &format!("Deleted folder: {}", folder),
                            Some("blue"),
                        ),
                        Err(e) => stream_processor::emit_log(
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
            for (path, label) in [(sln_path, "solution file"), (vsconfig_path, ".vsconfig")] {
                if path.exists() {
                    match std::fs::remove_file(&path) {
                        Ok(()) => stream_processor::emit_log(
                            &app,
                            &format!(
                                "Deleted file: {}",
                                path.file_name().unwrap_or_default().to_string_lossy()
                            ),
                            Some("blue"),
                        ),
                        Err(e) => stream_processor::emit_log(
                            &app,
                            &format!("[ERROR] Could not delete {}: {}", label, e),
                            Some("red"),
                        ),
                    }
                }
            }

            stream_processor::emit_log(&app, "Cleaning completed.", Some("blue"));
            let start = Instant::now();
            stream_processor::emit_progress(&app, 10, start.elapsed().as_millis() as u64);

            // 3. Run UnrealVersionSelector -projectfiles
            stream_processor::emit_log(&app, "Generating project files...", Some("blue"));
            let args = vec!["-projectfiles".to_string(), uproject_path.clone()];
            let cwd = project_dir.to_str().filter(|s| !s.is_empty());
            let mut cmd = build_cmd(&version_selector_path, &args, cwd);
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());

            let mut child = cmd.spawn().map_err(|e| e.to_string())?;
            running_process::set_running_pid(child.id());
            let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
            let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
            let stdout_reader = std::io::BufReader::new(stdout);
            let stderr_reader = std::io::BufReader::new(stderr);
            process_streams(
                stdout_reader,
                stderr_reader,
                app.clone(),
                ToolMode::Regenerate,
            );

            child.wait().map_err(|e| e.to_string())?;
            running_process::clear_running_pid();
            Ok(())
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    result?;

    stream_processor::emit_log(&app, "Project files generated!", Some("green"));

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
                            stream_processor::emit_log(
                                &app,
                                "Building project (Development Editor)...",
                                Some("blue"),
                            );
                            stream_processor::emit_progress(&app, 25, 0);
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
                            running_process::set_running_pid(child.id());
                            let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
                            let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
                            let stdout_reader = std::io::BufReader::new(stdout);
                            let stderr_reader = std::io::BufReader::new(stderr);
                            process_streams(
                                stdout_reader,
                                stderr_reader,
                                app.clone(),
                                ToolMode::Build,
                            );

                            let status = child.wait().map_err(|e| e.to_string())?;
                            running_process::clear_running_pid();
                            if status.success() {
                                stream_processor::emit_log(
                                    &app,
                                    "Build completed successfully!",
                                    Some("green"),
                                );
                                Ok(())
                            } else {
                                stream_processor::emit_log(
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
                    stream_processor::emit_log(
                        &app,
                        "[WARNING] Build.bat not found. Skipping build.",
                        Some("orange"),
                    );
                }
            } else {
                stream_processor::emit_log(
                    &app,
                    "[WARNING] Could not resolve engine root. Skipping build.",
                    Some("orange"),
                );
            }
        } else {
            stream_processor::emit_log(
                &app,
                "[WARNING] Engine path not found. Skipping build.",
                Some("orange"),
            );
        }
    }

    if open_project_after {
        stream_processor::emit_log(&app, "Opening project...", Some("blue"));
        let _ = crate::commands::process::open_file(uproject_path.clone());
    }
    if open_sln_after {
        let sln_path = project_dir.join(format!("{}.sln", project_name.as_str()));
        if sln_path.exists() {
            stream_processor::emit_log(&app, "Opening solution...", Some("blue"));
            let _ = crate::commands::process::open_file(sln_path.to_string_lossy().to_string());
        } else {
            stream_processor::emit_log(
                &app,
                "[ERROR] .sln file not found after generation.",
                Some("red"),
            );
        }
    }

    Ok(())
}
