//! Project-related commands - analyse_uproject, get_project_thumbnail_path, etc.
//! Step 6 & 7 implementation

use std::path::Path;
use walkdir::WalkDir;

use crate::commands::registry;
use crate::types::ProjectInfo;

#[derive(serde::Deserialize)]
struct UProjectJson {
    #[serde(rename = "EngineAssociation")]
    engine_association: Option<String>,
}

/// Analyse a .uproject file and return ProjectInfo.
/// Mirrors Form1.AnalyseUprojectFile from UECommandHelper.
#[tauri::command]
pub fn analyse_uproject(path: String) -> Result<ProjectInfo, String> {
    let uproj_path = Path::new(&path);
    if !uproj_path.exists() || uproj_path.extension().map_or(true, |e| e != "uproject") {
        return Err("Invalid or missing .uproject file".to_string());
    }

    let project_name = uproj_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let project_dir = uproj_path.parent().ok_or("Invalid project path")?;

    // Parse EngineAssociation from .uproject JSON
    let engine_version = {
        let content = std::fs::read_to_string(uproj_path)
            .map_err(|e| format!("Failed to read .uproject: {}", e))?;
        let json: UProjectJson = serde_json::from_str(&content).unwrap_or(UProjectJson {
            engine_association: None,
        });
        json.engine_association
            .unwrap_or_else(|| "Unknown".to_string())
    };

    let maps = scan_maps_for_project_dir(project_dir);

    // Check for Source/ folder → is_cpp
    let source_dir = project_dir.join("Source");
    let is_cpp = source_dir.exists();

    // Match engine path from registry (project may have "5.7", engine "5.7.1")
    let engine_install_path = registry::get_installed_engine_paths()
        .ok()
        .unwrap_or_default()
        .into_iter()
        .find(|e| e.version == engine_version || e.version.starts_with(&engine_version))
        .map(|e| e.editor_path)
        .unwrap_or_else(|| "Unknown".to_string());

    Ok(ProjectInfo {
        project_path: path,
        project_name,
        engine_version,
        engine_install_path,
        is_cpp,
        maps,
    })
}

/// Resolve project thumbnail path. Returns first existing:
/// 1. {projectDir}/{projectName}.png
/// 2. {projectDir}/Saved/AutoScreenshot.png
/// Mirrors LauncherBtn.LoadPicture from UECommandHelper.
#[tauri::command]
pub fn get_project_thumbnail_path(project_path: String) -> Result<Option<String>, String> {
    let path = Path::new(&project_path);
    let project_dir = path.parent().ok_or("Invalid project path")?;
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");

    // 1. .png next to .uproject
    let png_next = project_dir.join(format!("{}.png", stem));
    if png_next.exists() {
        return Ok(Some(png_next.to_string_lossy().to_string()));
    }

    // 2. Saved/AutoScreenshot.png
    let screenshot = project_dir.join("Saved").join("AutoScreenshot.png");
    if screenshot.exists() {
        return Ok(Some(screenshot.to_string_lossy().to_string()));
    }

    Ok(None)
}

/// Filter a list of paths to only those that exist. Returns paths that exist.
#[tauri::command]
pub fn filter_existing_paths(paths: Vec<String>) -> Result<Vec<String>, String> {
    Ok(paths
        .into_iter()
        .filter(|p| Path::new(p).exists())
        .collect())
}

fn scan_maps_for_project_dir(project_dir: &Path) -> Vec<String> {
    let content_dir = project_dir.join("Content");
    if !content_dir.exists() {
        return vec![];
    }
    WalkDir::new(&content_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "umap"))
        .map(|e| {
            let rel = e.path().strip_prefix(&content_dir).unwrap_or(e.path());
            let path_str = rel.with_extension("").to_string_lossy().replace('\\', "/");
            format!("/Game/{}", path_str)
        })
        .collect()
}

/// Scan Content/ for *.umap files and return map paths in /Game/... format.
/// Used to refresh maps when project still exists (new or deleted maps).
#[tauri::command]
pub fn scan_project_maps(project_path: String) -> Result<Vec<String>, String> {
    let path = Path::new(&project_path);
    if !path.exists() || path.extension().map_or(true, |e| e != "uproject") {
        return Err("Invalid or missing .uproject file".to_string());
    }
    let project_dir = path.parent().ok_or("Invalid project path")?;
    Ok(scan_maps_for_project_dir(project_dir))
}
