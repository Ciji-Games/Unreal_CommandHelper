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
    /// Custom display name (e.g. "UE 5.4 Custom Build"). Only for custom engines.
    #[serde(default)]
    pub display_name: Option<String>,
    /// True if user-added, not from registry.
    #[serde(default)]
    pub is_custom: bool,
    /// Unique ID for custom engines (e.g. UUID). Registry engines use editor_path as id.
    #[serde(default)]
    pub id: Option<String>,
}
