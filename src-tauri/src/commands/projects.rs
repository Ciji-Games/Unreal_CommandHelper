//! Project-related commands - analyse_uproject, load_projects, etc.
//! Implementation in Step 4 & 6

#[tauri::command]
pub fn analyse_uproject(_path: String) -> Result<crate::types::ProjectInfo, String> {
    // Stub: will be implemented in Step 6
    Err("Not implemented yet".to_string())
}
