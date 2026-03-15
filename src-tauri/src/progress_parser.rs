//! Progress pattern parser for Unreal Engine output logs.
//! Reusable across Build, Cook, Package, HLOD, MiniMap, etc.

use regex::Regex;
use std::sync::OnceLock;

/// Progress update emitted to frontend
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressUpdate {
    pub percent: u32,
    pub elapsed_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_step: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_steps: Option<u32>,
}

/// Tool mode - determines which patterns and phase weights to use
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToolMode {
    /// Build, BuildPlugin, Regenerate+Build - [N/M] steps
    Build,
    /// Cook only - Cooked packages pattern
    Cook,
    /// Package = Build + Cook + Stage + Pak + Archive
    Package,
    /// Build HLOD - WP cells + Building HLOD actors
    BuildHlod,
    /// Build MiniMap - WP Processing cells
    BuildMiniMap,
    /// Delete HLOD - [N/M] Deleting
    DeleteHlod,
    /// Regenerate - Clean, Generate, optional Build
    Regenerate,
    /// Generic - any [N/M] pattern
    Generic,
}

/// Mutable state for progress parsing
pub struct ProgressState {
    pub tool_mode: ToolMode,
    pub start_time: std::time::Instant,
    pub current_phase: usize,
    pub phase_weights: Vec<u32>,
    pub phase_step_current: u32,
    pub phase_step_total: u32,
    pub last_percent: u32,
    pub build_skipped: bool,
    pub build_phase_seen: bool,
}

impl ProgressState {
    pub fn new(tool_mode: ToolMode) -> Self {
        let phase_weights = match tool_mode {
            ToolMode::Regenerate => vec![10, 15, 75],
            ToolMode::Package => vec![15, 60, 10, 10, 5],
            ToolMode::BuildHlod => vec![20, 80],
            ToolMode::BuildMiniMap | ToolMode::DeleteHlod => vec![100],
            ToolMode::Build | ToolMode::Cook | ToolMode::Generic => vec![100],
        };
        Self {
            tool_mode,
            start_time: std::time::Instant::now(),
            current_phase: 0,
            phase_weights,
            phase_step_current: 0,
            phase_step_total: 1,
            last_percent: 0,
            build_skipped: false,
            build_phase_seen: false,
        }
    }

    pub fn elapsed_ms(&self) -> u64 {
        self.start_time.elapsed().as_millis() as u64
    }
}

// --- Regex patterns (lazy static) ---

fn build_steps_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\[(\d+)\s*/\s*(\d+)\]").expect("invalid regex"))
}

fn cook_packages_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"Cooked packages (\d+) Packages Remain (\d+) Total (\d+)")
            .expect("invalid regex")
    })
}

fn wp_processing_cell_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\[(\d+)\s*/\s*(\d+)\] Processing cell").expect("invalid regex"))
}

fn wp_building_hlod_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"\[(\d+)\s*/\s*(\d+)\] Building HLOD actor").expect("invalid regex")
    })
}

fn wp_deleting_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\[(\d+)\s*/\s*(\d+)\] Deleting").expect("invalid regex"))
}

fn wp_minimap_cells_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\[(\d+)\s*/\s*(\d+)\] Processing cells").expect("invalid regex"))
}

/// Parse a line and update progress state. Returns Some(ProgressUpdate) when percent changed.
pub fn parse_line(line: &str, state: &mut ProgressState) -> Option<ProgressUpdate> {
    let elapsed_ms = state.elapsed_ms();

    // Phase completion markers (advance phase, no step count)
    match state.tool_mode {
        ToolMode::Regenerate => {
            if line.contains("Cleaning completed.") {
                state.current_phase = 1;
                state.phase_step_current = 0;
                state.phase_step_total = 1;
                return percent_from_phases(state, elapsed_ms);
            }
            if line.contains("Project files generated!") {
                state.current_phase = 2;
                state.phase_step_current = 1;
                state.phase_step_total = 1;
                return percent_from_phases(state, elapsed_ms);
            }
        }
        ToolMode::Package => {
            if line.contains("BUILD COMMAND STARTED") {
                state.current_phase = 0;
                state.build_phase_seen = true;
            }
            if line.contains("BUILD COMMAND COMPLETED") {
                state.current_phase = 1;
                state.phase_step_current = 0;
                state.phase_step_total = 1;
                return percent_from_phases(state, elapsed_ms);
            }
            if line.contains("COOK COMMAND STARTED") {
                state.current_phase = 1;
                state.phase_step_current = 0;
                state.phase_step_total = 1;
            }
        }
        ToolMode::BuildHlod => {
            if line.contains("#### Building") && line.contains("HLOD actors ####") {
                state.current_phase = 1;
                state.phase_step_current = 0;
                state.phase_step_total = 1;
            }
        }
        _ => {}
    }

    // "Target is up to date" - build skipped
    if line.contains("Target is up to date") && !state.build_skipped {
        state.build_skipped = true;
        if state.tool_mode == ToolMode::Package {
            state.current_phase = 1;
        } else if state.tool_mode == ToolMode::Regenerate {
            state.current_phase = 2;
        }
        state.phase_step_current = 1;
        state.phase_step_total = 1;
        return percent_from_phases(state, elapsed_ms);
    }

    // Cook packages: Cooked packages X Packages Remain Y Total Z
    if state.tool_mode == ToolMode::Cook || state.tool_mode == ToolMode::Package {
        if let Some(caps) = cook_packages_regex().captures(line) {
            let cooked: u32 = caps
                .get(1)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(0);
            let total: u32 = caps
                .get(3)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(1);
            if total > 0 {
                state.phase_step_current = cooked;
                state.phase_step_total = total;
                return percent_from_phases(state, elapsed_ms);
            }
        }
    }

    // Build steps [N/M]
    if state.tool_mode == ToolMode::Build
        || state.tool_mode == ToolMode::Package
        || state.tool_mode == ToolMode::Regenerate
    {
        if let Some(caps) = build_steps_regex().captures(line) {
            let current: u32 = caps
                .get(1)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(0);
            let total: u32 = caps
                .get(2)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(1);
            if total > 0 {
                state.phase_step_current = current;
                state.phase_step_total = total;
                return percent_from_phases(state, elapsed_ms);
            }
        }
    }

    // WP Processing cell [N/M]
    if state.tool_mode == ToolMode::BuildHlod {
        if let Some(caps) = wp_processing_cell_regex().captures(line) {
            let current: u32 = caps
                .get(1)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(0);
            let total: u32 = caps
                .get(2)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(1);
            if total > 0 {
                state.phase_step_current = current;
                state.phase_step_total = total;
                return percent_from_phases(state, elapsed_ms);
            }
        }
        if let Some(caps) = wp_building_hlod_regex().captures(line) {
            let current: u32 = caps
                .get(1)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(0);
            let total: u32 = caps
                .get(2)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(1);
            if total > 0 {
                state.phase_step_current = current;
                state.phase_step_total = total;
                return percent_from_phases(state, elapsed_ms);
            }
        }
    }

    if state.tool_mode == ToolMode::DeleteHlod {
        if let Some(caps) = wp_deleting_regex().captures(line) {
            let current: u32 = caps
                .get(1)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(0);
            let total: u32 = caps
                .get(2)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(1);
            if total > 0 {
                state.phase_step_current = current;
                state.phase_step_total = total;
                return percent_from_phases(state, elapsed_ms);
            }
        }
    }

    if state.tool_mode == ToolMode::BuildMiniMap {
        if let Some(caps) = wp_minimap_cells_regex().captures(line) {
            let current: u32 = caps
                .get(1)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(0);
            let total: u32 = caps
                .get(2)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(1);
            if total > 0 {
                state.phase_step_current = current;
                state.phase_step_total = total;
                return percent_from_phases(state, elapsed_ms);
            }
        }
    }

    if state.tool_mode == ToolMode::Generic {
        if let Some(caps) = build_steps_regex().captures(line) {
            let current: u32 = caps
                .get(1)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(0);
            let total: u32 = caps
                .get(2)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(1);
            if total > 0 {
                state.phase_step_current = current;
                state.phase_step_total = total;
                return percent_from_phases(state, elapsed_ms);
            }
        }
    }

    None
}

fn percent_from_phases(state: &mut ProgressState, elapsed_ms: u64) -> Option<ProgressUpdate> {
    let weights = &state.phase_weights;
    let phase_idx = state.current_phase.min(weights.len().saturating_sub(1));
    let total_weight: u32 = weights.iter().sum();
    if total_weight == 0 {
        let pct = 100;
        if pct != state.last_percent {
            state.last_percent = pct;
            return Some(ProgressUpdate {
                percent: pct,
                elapsed_ms,
                phase_name: None,
                current_step: Some(state.phase_step_current),
                total_steps: Some(state.phase_step_total),
            });
        }
        return None;
    }

    let mut acc: u32 = 0;
    for (i, &w) in weights.iter().enumerate() {
        if i < phase_idx {
            acc += w;
        } else if i == phase_idx {
            let phase_pct = if state.phase_step_total > 0 {
                (state.phase_step_current as f64 / state.phase_step_total as f64) * 100.0
            } else {
                0.0
            };
            acc += (w as f64 * phase_pct / 100.0) as u32;
            break;
        } else {
            break;
        }
    }
    let percent = ((acc as f64 / total_weight as f64) * 100.0).min(100.0) as u32;

    if percent != state.last_percent {
        state.last_percent = percent;
        Some(ProgressUpdate {
            percent,
            elapsed_ms,
            phase_name: None,
            current_step: if state.phase_step_total > 0 {
                Some(state.phase_step_current)
            } else {
                None
            },
            total_steps: if state.phase_step_total > 0 {
                Some(state.phase_step_total)
            } else {
                None
            },
        })
    } else {
        None
    }
}
