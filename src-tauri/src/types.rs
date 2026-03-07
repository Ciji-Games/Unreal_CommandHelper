//! Shared types for UE Launcher backend

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub project_path: String,
    pub project_name: String,
    pub engine_version: String,
    pub engine_install_path: String,
    pub is_cpp: bool,
    pub maps: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EngineEntry {
    pub version: String,
    pub editor_path: String,
}
