//! Plugin Helper - build and package plugins. Translation of BuildPlugin.bat.
//! Step 13: List projects with Plugins folder, list plugins, build with selected engine, optional zip.

use std::fs;
use std::path::Path;

use tauri::AppHandle;
use walkdir::WalkDir;

use crate::commands::monitor;
use crate::commands::registry;
use crate::progress_parser::ToolMode;
use crate::running_process;
use crate::stream_processor::{self, process_streams};
use crate::utils::build_cmd;

/// Plugin info - a .uplugin file found in a project's Plugins folder
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub name: String,
    pub uplugin_path: String,
    pub folder_path: String,
}

/// List plugins for a project. Returns plugins found in project_dir/Plugins/.
/// Each plugin is a folder containing a .uplugin file, or a .uplugin directly in Plugins/.
#[tauri::command]
pub fn list_plugins_for_project(project_path: String) -> Result<Vec<PluginInfo>, String> {
    let uproj = Path::new(&project_path);
    if !uproj.exists() || uproj.extension().map_or(true, |e| e != "uproject") {
        return Err("Invalid or missing .uproject file".to_string());
    }

    let project_dir = uproj.parent().ok_or("Invalid project path")?;
    let plugins_dir = project_dir.join("Plugins");
    if !plugins_dir.exists() || !plugins_dir.is_dir() {
        return Ok(vec![]);
    }

    let mut plugins = Vec::new();
    for entry in fs::read_dir(&plugins_dir).map_err(|e| format!("Failed to read Plugins dir: {}", e))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            // Plugins/PluginName/PluginName.uplugin
            for uplugin in fs::read_dir(&path).ok().into_iter().flatten() {
                if let Ok(e) = uplugin {
                    let p = e.path();
                    if p.extension().map_or(false, |ext| ext == "uplugin") {
                        let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown").to_string();
                        plugins.push(PluginInfo {
                            name: name.clone(),
                            uplugin_path: p.to_string_lossy().to_string(),
                            folder_path: path.to_string_lossy().to_string(),
                        });
                        break; // one .uplugin per folder
                    }
                }
            }
        } else if path.extension().map_or(false, |e| e == "uplugin") {
            // Plugins/PluginName.uplugin (single-file plugin)
            let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown").to_string();
            let folder = path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
            plugins.push(PluginInfo {
                name: name.clone(),
                uplugin_path: path.to_string_lossy().to_string(),
                folder_path: folder,
            });
        }
    }

    Ok(plugins)
}

/// Get engine root (InstalledDirectory) from editor path.
/// UnrealEditor.exe is at Engine/Binaries/Win64/UnrealEditor.exe
fn editor_path_to_engine_root(editor_path: &str) -> Option<std::path::PathBuf> {
    let mut p = Path::new(editor_path).to_path_buf();
    for _ in 0..4 {
        p = p.parent()?.to_path_buf();
    }
    Some(p)
}

/// Build a plugin using RunUAT BuildPlugin. Optionally zip the result.
/// engine_version: e.g. "5.4" - used to look up engine path from registry.
/// create_zip: if true, zip the Build output as {plugin_name}_{engine_version}.zip
#[tauri::command]
pub async fn build_plugin(
    uplugin_path: String,
    engine_version: String,
    create_zip: bool,
    app: AppHandle,
) -> Result<String, String> {
    if monitor::has_blocking_processes("umap".to_string())? {
        return Err(
            "Cannot build plugin: Unreal Engine is running. Close it first.".to_string(),
        );
    }

    let uplugin = Path::new(&uplugin_path);
    if !uplugin.exists() || uplugin.extension().map_or(true, |e| e != "uplugin") {
        return Err("Invalid or missing .uplugin file".to_string());
    }

    let plugin_folder = uplugin
        .parent()
        .ok_or("Invalid plugin path")?
        .to_path_buf();
    let plugin_name = uplugin
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Plugin")
        .to_string();

    // Resolve engine path from registry
    let engines = registry::get_installed_engine_paths().map_err(|e| e.to_string())?;
    let engine_entry = engines
        .into_iter()
        .find(|e| e.version == engine_version || e.version.starts_with(&engine_version));
    let editor_path = match engine_entry {
        Some(e) => e.editor_path,
        None => return Err(format!("Engine version {} not found in registry", engine_version)),
    };

    let engine_root = editor_path_to_engine_root(&editor_path)
        .ok_or("Could not resolve engine root from editor path")?;
    let run_uat = engine_root
        .join("Engine")
        .join("Build")
        .join("BatchFiles")
        .join("RunUAT.bat");
    if !run_uat.exists() {
        return Err(format!("RunUAT.bat not found at {:?}", run_uat));
    }

    let package_dir = plugin_folder.join("Build");
    let batch_dir = run_uat.parent().ok_or("Invalid RunUAT path")?;
    let cwd: String = batch_dir
        .to_str()
        .ok_or("Invalid BatchFiles path")?
        .to_string();

    stream_processor::emit_log(&app, &format!("Building plugin: {} for engine {}", plugin_name, engine_version), Some("blue"));
    stream_processor::emit_log(
        &app,
        &format!("Plugin: {} -> Package: {}", uplugin_path, package_dir.display()),
        None,
    );

    let args = vec![
        "BuildPlugin".to_string(),
        format!("-Plugin={}", uplugin_path),
        format!("-Package={}", package_dir.display()),
        "-Rocket".to_string(),
        "-TargetPlatforms=Win64".to_string(),
    ];

    let run_uat_str = run_uat.to_string_lossy().to_string();
    let result = tokio::task::spawn_blocking({
        let app = app.clone();
        let plugin_folder = plugin_folder.clone();
        let plugin_name = plugin_name.clone();
        let engine_version = engine_version.clone();
        let create_zip = create_zip;
        let run_uat_str = run_uat_str.clone();
        let cwd = cwd.clone();
        move || -> Result<String, String> {
            let mut cmd = build_cmd(&run_uat_str, &args, Some(&cwd));
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());

            let mut child = cmd.spawn().map_err(|e| e.to_string())?;
            running_process::set_running_pid(child.id());
            let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
            let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
            let stdout_reader = std::io::BufReader::new(stdout);
            let stderr_reader = std::io::BufReader::new(stderr);
            process_streams(stdout_reader, stderr_reader, app.clone(), ToolMode::Build);

            child.wait().map_err(|e| e.to_string())?;
            running_process::clear_running_pid();

            // BuildPlugin outputs to Package/PluginName/ or directly to Package/ (with Binaries, Content, etc.)
            let package_dir = plugin_folder.join("Build");
            let build_output = if package_dir.join(&plugin_name).exists() {
                package_dir.join(&plugin_name)
            } else if package_dir.exists()
                && (package_dir.join("Binaries").exists() || package_dir.join("Content").exists())
            {
                // Output directly in Package/
                package_dir.clone()
            } else {
                return Err("Build output folder not found. Build may have failed.".to_string());
            };

            let mut result_path = build_output.to_string_lossy().to_string();

            if create_zip {
                let zip_name = format!("{}_{}.zip", plugin_name, engine_version.replace('.', "_"));
                // Output zip in Plugins folder (parent of plugin folder), not inside the plugin folder
                let plugins_folder = plugin_folder.parent().unwrap_or(&plugin_folder);
                let zip_path = plugins_folder.join(&zip_name);
                stream_processor::emit_log(&app, &format!("Zipping: {}", zip_name), Some("blue"));

                let file = fs::File::create(&zip_path).map_err(|e| format!("Failed to create zip: {}", e))?;
                let mut zip_writer = zip::ZipWriter::new(file);
                let options = zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Deflated)
                    .unix_permissions(0o755);

                // Zip contents with PluginName/ as root (matches BuildPlugin.bat behavior)
                let root_in_zip = format!("{}/", plugin_name);
                for entry in WalkDir::new(&build_output).into_iter().filter_map(Result::ok) {
                    let path = entry.path();
                    if path.is_file() {
                        let rel = path.strip_prefix(&build_output).unwrap_or(path);
                        let name_str = rel.to_string_lossy().replace('\\', "/");
                        let zip_entry = format!("{}{}", root_in_zip, name_str);
                        zip_writer
                            .start_file(&zip_entry, options.clone())
                            .map_err(|e| e.to_string())?;
                        let mut f = fs::File::open(path).map_err(|e| e.to_string())?;
                        std::io::copy(&mut f, &mut zip_writer).map_err(|e| e.to_string())?;
                    }
                }
                zip_writer.finish().map_err(|e| e.to_string())?;

                result_path = zip_path.to_string_lossy().to_string();
                stream_processor::emit_log(&app, &format!("Zipped successfully: {}", result_path), Some("green"));
            } else {
                stream_processor::emit_log(&app, "Build completed successfully.", Some("green"));
            }

            Ok(result_path)
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    result
}
