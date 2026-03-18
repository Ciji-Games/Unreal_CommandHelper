//! Detect which IDE opens .sln files (Rider vs Visual Studio) via Windows registry.

use serde::Serialize;

#[derive(Serialize)]
pub struct SlnIdeResult {
    pub ide: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rider_path: Option<String>,
}

/// Detect which IDE is associated with .sln files.
/// Returns "rider", "visual_studio", or "unknown".
/// When Rider is detected, also returns the rider64.exe path from the registry.
#[tauri::command]
pub fn detect_sln_ide() -> Result<SlnIdeResult, String> {
    #[cfg(not(windows))]
    {
        let _ = ();
        return Ok(SlnIdeResult {
            ide: "unknown".to_string(),
            rider_path: None,
        });
    }

    #[cfg(windows)]
    {
        let prog_id = match get_sln_prog_id() {
            Ok(p) => p,
            Err(_) => return Ok(SlnIdeResult { ide: "unknown".to_string(), rider_path: None }),
        };
        let (command, exe_path) = match get_shell_open_command(&prog_id) {
            Ok(c) => c,
            Err(_) => return Ok(SlnIdeResult { ide: "unknown".to_string(), rider_path: None }),
        };

        let path_lower = exe_path.to_lowercase();

        // Rider: path contains rider or JetBrains
        if path_lower.contains("rider") || path_lower.contains("jetbrains") {
            let rider_path = extract_rider_exe_path(&command);
            return Ok(SlnIdeResult {
                ide: "rider".to_string(),
                rider_path,
            });
        }

        // Visual Studio: path contains devenv, vslauncher, or visual studio
        if path_lower.contains("devenv")
            || path_lower.contains("vslauncher")
            || path_lower.contains("visual studio")
        {
            return Ok(SlnIdeResult {
                ide: "visual_studio".to_string(),
                rider_path: None,
            });
        }

        Ok(SlnIdeResult {
            ide: "unknown".to_string(),
            rider_path: None,
        })
    }
}

#[cfg(windows)]
fn get_sln_prog_id() -> Result<String, String> {
    use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER};
    use winreg::RegKey;

    // User override takes precedence
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let file_exts = r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.sln";
    if let Ok(ext_key) = hkcu.open_subkey(file_exts) {
        if let Ok(user_choice) = ext_key.open_subkey("UserChoice") {
            if let Ok(prog_id) = user_choice.get_value::<String, _>("ProgId") {
                let pid = prog_id.trim();
                if !pid.is_empty() {
                    return Ok(pid.to_string());
                }
            }
        }
    }

    // Fall back to HKCR\.sln default
    let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);
    let sln_key = hkcr.open_subkey(".sln").map_err(|e| e.to_string())?;
    let prog_id = sln_key
        .get_value::<String, _>("")
        .map_err(|e| e.to_string())?;
    Ok(prog_id.trim().to_string())
}

#[cfg(windows)]
fn get_shell_open_command(prog_id: &str) -> Result<(String, String), String> {
    use winreg::enums::HKEY_CLASSES_ROOT;
    use winreg::RegKey;

    let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);

    // Try shell\open\command
    let command_path = format!(r"{}\shell\open\command", prog_id);
    let key = hkcr.open_subkey(&command_path).map_err(|e| e.to_string())?;
    let command: String = key.get_value("").map_err(|e| e.to_string())?;
    let exe_path = extract_exe_path_from_command(&command);
    Ok((command, exe_path))
}

#[cfg(windows)]
fn extract_exe_path_from_command(command: &str) -> String {
    // Command format: "C:\path\to\exe.exe" "%1" or similar
    let trimmed = command.trim();
    if trimmed.starts_with('"') {
        if let Some(end) = trimmed[1..].find('"') {
            return trimmed[1..1 + end].to_string();
        }
    }
    // No quotes: take first token
    trimmed
        .split_whitespace()
        .next()
        .unwrap_or(trimmed)
        .to_string()
}

#[cfg(windows)]
fn extract_rider_exe_path(command: &str) -> Option<String> {
    let path = extract_exe_path_from_command(command);
    if path.to_lowercase().contains("rider") {
        return Some(path);
    }
    None
}
