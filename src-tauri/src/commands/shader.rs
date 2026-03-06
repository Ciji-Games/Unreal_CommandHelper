//! ShaderCompileWorker process priority (Shader Booster)
//! Implementation in Step 12

#[tauri::command]
pub fn get_shader_worker_status() -> Result<ShaderStatus, String> {
    // Stub: will be implemented in Step 12
    Ok(ShaderStatus {
        running: false,
        priority: None,
    })
}

#[tauri::command]
pub fn set_shader_worker_priority(_priority: String) -> Result<(), String> {
    // Stub: will be implemented in Step 12
    Ok(())
}

#[derive(serde::Serialize)]
pub struct ShaderStatus {
    pub running: bool,
    pub priority: Option<String>,
}
