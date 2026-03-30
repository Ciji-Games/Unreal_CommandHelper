//! Detect which IDE opens .sln files (Rider vs Visual Studio) via Windows registry.

use serde::Serialize;
use tauri::async_runtime::spawn_blocking;

#[derive(Serialize)]
pub struct SlnIdeResult {
    pub ide: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rider_path: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct IdeCandidate {
    pub id: String,
    pub label: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exe_path: Option<String>,
    pub detected: bool,
}

/// Detect which IDE is associated with .sln files.
/// Returns "rider", "visual_studio", or "unknown".
/// When Rider is detected, also returns the rider64.exe path from the registry.
#[tauri::command]
pub async fn detect_sln_ide() -> Result<SlnIdeResult, String> {
    spawn_blocking(detect_sln_ide_impl)
        .await
        .map_err(|e| format!("IDE detection task failed: {}", e))?
}

fn detect_sln_ide_impl() -> Result<SlnIdeResult, String> {
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
            Err(_) => {
                return Ok(SlnIdeResult {
                    ide: "unknown".to_string(),
                    rider_path: None,
                })
            }
        };
        let (command, exe_path) = match get_shell_open_command(&prog_id) {
            Ok(c) => c,
            Err(_) => {
                return Ok(SlnIdeResult {
                    ide: "unknown".to_string(),
                    rider_path: None,
                })
            }
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

/// Detect installed IDE candidates (Rider + Visual Studio instances).
/// Also returns a default IDE id inferred from current .sln association.
#[tauri::command]
pub async fn list_installed_ides() -> Result<(Vec<IdeCandidate>, Option<String>), String> {
    spawn_blocking(list_installed_ides_impl)
        .await
        .map_err(|e| format!("IDE discovery task failed: {}", e))?
}

fn list_installed_ides_impl() -> Result<(Vec<IdeCandidate>, Option<String>), String> {
    #[cfg(not(windows))]
    {
        let _ = ();
        return Ok((Vec::new(), None));
    }

    #[cfg(windows)]
    {
        let mut candidates: Vec<IdeCandidate> = Vec::new();

        if let Some(rider_path) = find_rider_exe() {
            candidates.push(IdeCandidate {
                id: format!("rider::{}", rider_path.to_lowercase()),
                label: "JetBrains Rider".to_string(),
                kind: "rider".to_string(),
                exe_path: Some(rider_path),
                detected: true,
            });
        }
        if let Ok(sln_ide) = detect_sln_ide_impl() {
            if sln_ide.ide == "rider" {
                if let Some(path) = sln_ide.rider_path {
                    let path_lc = path.to_lowercase();
                    let already = candidates.iter().any(|c| c.id == format!("rider::{}", path_lc));
                    if !already {
                        candidates.push(IdeCandidate {
                            id: format!("rider::{}", path_lc),
                            label: "JetBrains Rider".to_string(),
                            kind: "rider".to_string(),
                            exe_path: Some(path),
                            detected: true,
                        });
                    }
                }
            }
        }

        candidates.extend(find_visual_studio_instances());

        let default_id = detect_default_ide_id(&candidates);
        Ok((candidates, default_id))
    }
}

#[cfg(windows)]
fn detect_default_ide_id(candidates: &[IdeCandidate]) -> Option<String> {
    let detected = detect_sln_ide_impl().ok()?;
    let path = detected.rider_path.map(|p| p.to_lowercase());
    match detected.ide.as_str() {
        "rider" => candidates
            .iter()
            .find(|c| c.kind == "rider")
            .and_then(|c| {
                if let (Some(candidate_path), Some(detected_path)) = (c.exe_path.clone(), path.clone()) {
                    if candidate_path.to_lowercase() == detected_path {
                        return Some(c.id.clone());
                    }
                }
                None
            })
            .or_else(|| {
                candidates
                    .iter()
                    .find(|c| c.kind == "rider")
                    .map(|c| c.id.clone())
            }),
        "visual_studio" => candidates
            .iter()
            .find(|c| c.kind == "visual_studio")
            .map(|c| c.id.clone()),
        _ => None,
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

#[cfg(windows)]
fn find_rider_exe() -> Option<String> {
    use std::path::Path;

    let local_app_data = std::env::var("LOCALAPPDATA").ok()?;
    let program_files = std::env::var("PROGRAMFILES").ok()?;
    let program_files_x86 = std::env::var("PROGRAMFILES(X86)").unwrap_or_default();

    let search_bases = [
        format!("{}\\Programs", local_app_data),
        format!("{}\\JetBrains", program_files),
        format!("{}\\JetBrains", program_files_x86),
    ];

    let toolbox_roots = [
        format!("{}\\JetBrains\\Toolbox\\apps\\Rider", local_app_data),
        format!("{}\\JetBrains\\Toolbox\\apps\\Rider\\ch-0", local_app_data),
    ];

    for root in &toolbox_roots {
        let root_path = Path::new(root);
        if !root_path.exists() {
            continue;
        }
        if let Some(p) = scan_rider_under(root_path) {
            return Some(p);
        }
    }

    let mut best_match: Option<String> = None;
    for base in &search_bases {
        let base_path = Path::new(base);
        if !base_path.exists() {
            continue;
        }
        let entries = match std::fs::read_dir(base_path) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.filter_map(Result::ok) {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            let path = entry.path();
            if name.contains("rider") && path.is_dir() {
                let bin64 = path.join("bin").join("rider64.exe");
                let bin = path.join("bin").join("rider.exe");
                if bin64.exists() {
                    best_match = Some(bin64.to_string_lossy().to_string());
                } else if bin.exists() {
                    best_match = Some(bin.to_string_lossy().to_string());
                }
            }
        }
    }
    best_match
}

#[cfg(windows)]
fn scan_rider_under(root: &std::path::Path) -> Option<String> {
    let mut stack = vec![root.to_path_buf()];
    for _ in 0..4 {
        let mut next = Vec::new();
        while let Some(dir) = stack.pop() {
            let bin64 = dir.join("bin").join("rider64.exe");
            if bin64.exists() {
                return Some(bin64.to_string_lossy().to_string());
            }
            let bin = dir.join("bin").join("rider.exe");
            if bin.exists() {
                return Some(bin.to_string_lossy().to_string());
            }
            let entries = match std::fs::read_dir(&dir) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for entry in entries.filter_map(Result::ok) {
                let path = entry.path();
                if path.is_dir() {
                    next.push(path);
                }
            }
        }
        stack = next;
    }
    None
}

#[cfg(windows)]
fn find_visual_studio_instances() -> Vec<IdeCandidate> {
    use serde_json::Value;
    use std::path::Path;
    use std::process::Command;

    let mut candidates = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let pf86 = std::env::var("PROGRAMFILES(X86)").unwrap_or_default();
    let pf = std::env::var("PROGRAMFILES").unwrap_or_default();
    let paths = [
        format!(
            "{}\\Microsoft Visual Studio\\Installer\\vswhere.exe",
            pf86
        ),
        format!(
            "{}\\Microsoft Visual Studio\\Installer\\vswhere.exe",
            pf
        ),
    ];

    for vswhere_path in paths {
        if vswhere_path.trim().is_empty() || !Path::new(&vswhere_path).exists() {
            continue;
        }

        let output = match Command::new(&vswhere_path)
            .args([
                "-all",
                "-products",
                "*",
                "-requires",
                "Microsoft.Component.MSBuild",
                "-format",
                "json",
            ])
            .output()
        {
            Ok(o) => o,
            Err(_) => continue,
        };

        if !output.status.success() {
            continue;
        }

        let parsed: Value = match serde_json::from_slice(&output.stdout) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let instances = match parsed.as_array() {
            Some(a) => a,
            None => continue,
        };

        for item in instances {
            let display_name = item
                .get("displayName")
                .and_then(Value::as_str)
                .unwrap_or("Visual Studio");
            let display_version = item
                .get("catalog")
                .and_then(|c| c.get("productDisplayVersion"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let installation_path = item
                .get("installationPath")
                .and_then(Value::as_str)
                .unwrap_or("");
            if installation_path.is_empty() {
                continue;
            }
            let devenv = Path::new(installation_path)
                .join("Common7")
                .join("IDE")
                .join("devenv.exe");
            if !devenv.exists() {
                continue;
            }
            let exe = devenv.to_string_lossy().to_string();
            let exe_lc = exe.to_lowercase();
            if seen.contains(&exe_lc) {
                continue;
            }
            seen.insert(exe_lc.clone());

            let year = display_name
                .split_whitespace()
                .find(|s| s.chars().all(|c| c.is_ascii_digit()))
                .unwrap_or("");
            let label = if year.is_empty() {
                format!("Visual Studio {}", display_version).trim().to_string()
            } else if display_version.is_empty() {
                format!("Visual Studio {}", year)
            } else {
                format!("Visual Studio {} ({})", year, display_version)
            };

            candidates.push(IdeCandidate {
                id: format!("visual_studio::{}", exe_lc),
                label,
                kind: "visual_studio".to_string(),
                exe_path: Some(exe),
                detected: true,
            });
        }
    }

    candidates.sort_by(|a, b| a.label.cmp(&b.label));
    candidates
}
