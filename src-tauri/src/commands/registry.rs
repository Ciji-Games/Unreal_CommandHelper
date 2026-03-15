//! Windows registry commands - engine paths, UnrealVersionSelector
//! Step 5: Implement Windows registry & engine discovery

use std::path::Path;

#[cfg(windows)]
use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_LOCAL_MACHINE};
#[cfg(windows)]
use winreg::RegKey;

use crate::types::EngineEntry;

/// Build.version JSON structure (Engine/Build/Build.version)
#[derive(serde::Deserialize)]
struct BuildVersion {
    #[serde(rename = "MajorVersion")]
    major_version: Option<u16>,
    #[serde(rename = "MinorVersion")]
    minor_version: Option<u16>,
    #[serde(rename = "PatchVersion")]
    patch_version: Option<u16>,
}

/// Resolve editor path to engine root (InstalledDirectory).
/// UnrealEditor.exe is at Engine/Binaries/Win64/UnrealEditor.exe
fn editor_path_to_engine_root(editor_path: &Path) -> Option<std::path::PathBuf> {
    let mut p = editor_path.to_path_buf();
    for _ in 0..4 {
        p = p.parent()?.to_path_buf();
    }
    Some(p)
}

/// Read full engine version (e.g. 5.7.1) from Engine/Build/Build.version.
/// Falls back to short_version if file is missing or unreadable.
fn read_engine_version_from_build_file(installed_dir: &Path, short_version: &str) -> String {
    let build_version_path = installed_dir
        .join("Engine")
        .join("Build")
        .join("Build.version");
    let content = match std::fs::read_to_string(&build_version_path) {
        Ok(c) => c,
        Err(_) => return short_version.to_string(),
    };
    let build: BuildVersion = match serde_json::from_str(&content) {
        Ok(b) => b,
        Err(_) => return short_version.to_string(),
    };
    match (
        build.major_version,
        build.minor_version,
        build.patch_version,
    ) {
        (Some(maj), Some(min), Some(patch)) => format!("{}.{}.{}", maj, min, patch),
        (Some(maj), Some(min), None) => format!("{}.{}", maj, min),
        _ => short_version.to_string(),
    }
}

/// Get UnrealVersionSelector.exe path from registry.
/// Registry: HKCR\Unreal.ProjectFile\shell\rungenproj → value "Icon"
/// Value format: "C:\...\UnrealVersionSelector.exe" (may have args; extract path up to .exe)
#[tauri::command]
pub fn get_unreal_version_selector_path() -> Result<Option<String>, String> {
    #[cfg(not(windows))]
    {
        let _ = ();
        return Ok(None);
    }

    #[cfg(windows)]
    {
        const REG_PATH: &str = r"Unreal.ProjectFile\shell\rungenproj";
        const VALUE_NAME: &str = "Icon";

        let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);
        let key = match hkcr.open_subkey(REG_PATH) {
            Ok(k) => k,
            Err(_) => return Ok(None), // Key doesn't exist (e.g. UE not installed)
        };

        let value: String = match key.get_value(VALUE_NAME) {
            Ok(v) => v,
            Err(_) => return Ok(None),
        };

        if value.trim().is_empty() {
            return Ok(None);
        }

        // Remove any arguments after the .exe path (Icon value may have args)
        let value = value.trim_matches('"');
        if let Some(exe_index) = value.to_lowercase().find(".exe") {
            return Ok(Some(value[..exe_index + 4].to_string()));
        }
        Ok(Some(value.to_string()))
    }
}

/// Get installed Unreal Engine paths from registry.
/// Registry: HKLM\SOFTWARE\EpicGames\Unreal Engine\{Version}
/// Each subkey has InstalledDirectory → e.g. C:\Program Files\Epic Games\UE_5.4
/// Editor exe: {InstalledDirectory}\Engine\Binaries\Win64\UnrealEditor.exe
#[tauri::command]
pub fn get_installed_engine_paths() -> Result<Vec<EngineEntry>, String> {
    #[cfg(not(windows))]
    {
        let _ = ();
        return Ok(vec![]);
    }

    #[cfg(windows)]
    {
        const REG_BASE: &str = r"SOFTWARE\EpicGames\Unreal Engine";

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let base_key = match hklm.open_subkey(REG_BASE) {
            Ok(k) => k,
            Err(_) => return Ok(vec![]), // UE not installed or registry not found
        };

        let mut engines = Vec::new();
        for subkey_name in base_key.enum_keys().filter_map(Result::ok) {
            if let Ok(sub_key) = base_key.open_subkey(&subkey_name) {
                if let Ok(installed_dir) = sub_key.get_value::<String, _>("InstalledDirectory") {
                    let installed_dir = installed_dir.trim();
                    if !installed_dir.is_empty() && std::path::Path::new(installed_dir).exists() {
                        let editor_path = std::path::Path::new(installed_dir)
                            .join("Engine")
                            .join("Binaries")
                            .join("Win64")
                            .join("UnrealEditor.exe");
                        if editor_path.exists() {
                            let version = read_engine_version_from_build_file(
                                std::path::Path::new(installed_dir),
                                &subkey_name,
                            );
                            engines.push(EngineEntry {
                                version,
                                editor_path: editor_path.to_string_lossy().to_string(),
                                display_name: None,
                                is_custom: false,
                                id: None,
                            });
                        }
                    }
                }
            }
        }

        Ok(engines)
    }
}

/// Validate that a path points to a valid Unreal Engine installation.
/// Accepts either engine root (InstalledDirectory) or UnrealEditor.exe path.
#[tauri::command]
pub fn validate_engine_path(path: String) -> Result<bool, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Ok(false);
    }
    let editor_path = if p.is_file() && p.file_name().map_or(false, |n| n == "UnrealEditor.exe") {
        p.to_path_buf()
    } else if p.is_dir() {
        p.join("Engine")
            .join("Binaries")
            .join("Win64")
            .join("UnrealEditor.exe")
    } else {
        return Ok(false);
    };
    Ok(editor_path.exists())
}

/// Read engine version from Build.version given UnrealEditor.exe path.
#[tauri::command]
pub fn read_engine_version_from_path(editor_path: String) -> Result<String, String> {
    let path = Path::new(&editor_path);
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }
    let engine_root = editor_path_to_engine_root(path)
        .ok_or_else(|| "Invalid editor path: could not resolve engine root".to_string())?;
    let version = read_engine_version_from_build_file(&engine_root, "Unknown");
    Ok(version)
}
