//! Regenerate project command - nuke solution, delete cache/build, run UnrealVersionSelector.
//! Step 8: Mirrors RegenerateProject.cs metroSetButton1_Click

use std::path::Path;
use std::time::Instant;

use tauri::AppHandle;

use crate::commands::monitor;
use crate::commands::registry;
use crate::progress_parser::ToolMode;
use crate::running_process;
use crate::stream_processor::{self, process_streams};
use crate::utils::build_cmd;

/// Resolve engine root from editor path (UnrealEditor.exe or UE4Editor.exe at Engine/Binaries/Win64/).
fn editor_path_to_engine_root(editor_path: &Path) -> Option<std::path::PathBuf> {
    let mut p = editor_path.to_path_buf();
    for _ in 0..4 {
        p = p.parent()?.to_path_buf();
    }
    Some(p)
}

/// Find UnrealBuildTool.exe. UE4: Engine/Binaries/DotNET/UnrealBuildTool.exe
/// UE5: Engine/Binaries/DotNET/UnrealBuildTool/UnrealBuildTool.exe
fn find_unreal_build_tool(engine_root: &Path) -> Option<std::path::PathBuf> {
    let dotnet = engine_root.join("Engine").join("Binaries").join("DotNET");
    let ue4_path = dotnet.join("UnrealBuildTool.exe");
    if ue4_path.exists() {
        return Some(ue4_path);
    }
    let ue5_path = dotnet.join("UnrealBuildTool").join("UnrealBuildTool.exe");
    if ue5_path.exists() {
        return Some(ue5_path);
    }
    None
}

/// Regenerate project files: delete Intermediate, DerivedDataCache, Build, .vs, Binaries,
/// .sln, .vsconfig; then generate project files.
/// UE4: Prefers UnrealBuildTool.exe (correct path: DotNET/UnrealBuildTool.exe); falls back to UnrealVersionSelector.
/// UE5: Prefers UnrealVersionSelector -projectfiles; falls back to UnrealBuildTool.exe.
/// Optionally build the project (Development Editor) so VS and UE recognize it as compiled.
#[tauri::command]
pub async fn regenerate_project(
    uproject_path: String,
    open_project_after: bool,
    open_ide_after: bool,
    build_after: bool,
    version_selector_path: String,
    engine_install_path: String,
    preferred_ide_kind: Option<String>,
    preferred_ide_exe_path: Option<String>,
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

    // UE4: prefer UnrealBuildTool (UnrealVersionSelector may use wrong path).
    // UE5: prefer UnrealVersionSelector; fall back to UnrealBuildTool.
    let ubt_path = (!engine_install_path.is_empty() && Path::new(&engine_install_path).exists())
        .then(|| editor_path_to_engine_root(Path::new(&engine_install_path)))
        .flatten()
        .and_then(|root| find_unreal_build_tool(&root));

    let is_ue4 = !engine_install_path.is_empty()
        && registry::read_engine_version_from_path(engine_install_path.clone())
            .ok()
            .map(|v| v.starts_with("4."))
            .unwrap_or(false);

    let version_selector_exists = Path::new(&version_selector_path).exists();
    let use_ubt = ubt_path.is_some() && (is_ue4 || !version_selector_exists);

    if !use_ubt && !version_selector_exists {
        stream_processor::emit_log(
            &app,
            "[ERROR] UnrealVersionSelector.exe not found. Set engine path or UnrealVersionSelector in settings.",
            Some("red"),
        );
        return Err("UnrealVersionSelector.exe not found. Set engine path for the project or UnrealVersionSelector path in settings.".to_string());
    }

    if monitor::has_blocking_processes("regenerate".to_string())? {
        return Err(
            "Cannot regenerate: Unreal Engine, Visual Studio, or JetBrains Rider is running. Close them first.".to_string(),
        );
    }

    let ubt_path_str = ubt_path.map(|p| p.to_string_lossy().to_string());
    let effective_ubt = if use_ubt {
        ubt_path_str.clone()
    } else {
        None
    };

    let result = tokio::task::spawn_blocking({
        let app = app.clone();
        let uproject_path = uproject_path.clone();
        let version_selector_path = version_selector_path.clone();
        let project_dir = project_dir.clone();
        let project_name = project_name.clone();
        let ubt_path = effective_ubt.clone();
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

            // 3. Generate project files: prefer UnrealBuildTool directly (correct UE4 path:
            //    DotNET/UnrealBuildTool.exe); fall back to UnrealVersionSelector
            stream_processor::emit_log(&app, "Generating project files...", Some("blue"));
            let (cmd_path, cmd_args, cmd_cwd) = if let Some(ref ubt) = ubt_path {
                // Engine root from UBT path: .../Engine/Binaries/DotNET/UnrealBuildTool.exe -> 4 levels up
                let engine_root = Path::new(ubt)
                    .parent()
                    .and_then(|p| p.parent())
                    .and_then(|p| p.parent())
                    .and_then(|p| p.parent());
                let cwd = engine_root
                    .map(|r| r.join("Engine").join("Source"))
                    .filter(|p| p.exists())
                    .and_then(|p| p.to_str().map(String::from));
                stream_processor::emit_log(
                    &app,
                    "Using UnrealBuildTool.exe directly (engine path)",
                    Some("gray"),
                );
                (
                    ubt.clone(),
                    vec![
                        "-ProjectFiles".to_string(),
                        format!("-project={}", uproject_path),
                        "-game".to_string(),
                    ],
                    cwd.or_else(|| project_dir.to_str().map(String::from)),
                )
            } else {
                stream_processor::emit_log(
                    &app,
                    "Using UnrealVersionSelector -projectfiles",
                    Some("gray"),
                );
                (
                    version_selector_path.clone(),
                    vec!["-projectfiles".to_string(), uproject_path.clone()],
                    project_dir
                        .to_str()
                        .filter(|s| !s.is_empty())
                        .map(String::from),
                )
            };

            let cwd = cmd_cwd.as_deref();
            let mut cmd = build_cmd(&cmd_path, &cmd_args, cwd);
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
    if open_ide_after {
        stream_processor::emit_log(&app, "Launching IDE...", Some("blue"));
        let _ = crate::commands::process::launch_ide_for_project(
            uproject_path.clone(),
            preferred_ide_kind.unwrap_or_else(|| "unknown".to_string()),
            preferred_ide_exe_path,
        );
    }

    Ok(())
}
