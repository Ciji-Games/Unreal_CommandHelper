//! Windows registry commands - engine paths, UnrealVersionSelector
//! Implementation in Step 5

#[tauri::command]
pub fn get_unreal_version_selector_path() -> Result<Option<String>, String> {
    // Stub: will be implemented in Step 5
    Ok(None)
}

#[tauri::command]
pub fn get_installed_engine_paths() -> Result<Vec<crate::types::EngineEntry>, String> {
    // Stub: will be implemented in Step 5
    Ok(vec![])
}
