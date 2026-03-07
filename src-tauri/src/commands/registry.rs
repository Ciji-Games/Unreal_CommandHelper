//! Windows registry commands - engine paths, UnrealVersionSelector
//! Step 5: Implement Windows registry & engine discovery

#[cfg(windows)]
use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_LOCAL_MACHINE};
#[cfg(windows)]
use winreg::RegKey;

use crate::types::EngineEntry;

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
                            engines.push(EngineEntry {
                                version: subkey_name.clone(),
                                editor_path: editor_path.to_string_lossy().to_string(),
                            });
                        }
                    }
                }
            }
        }

        Ok(engines)
    }
}
