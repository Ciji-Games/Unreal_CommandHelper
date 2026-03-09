mod commands;
mod progress_parser;
mod stream_processor;
mod types;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::registry::get_unreal_version_selector_path,
            commands::registry::get_installed_engine_paths,
            commands::projects::analyse_uproject,
            commands::projects::get_project_thumbnail_path,
            commands::process::open_file,
            commands::process::run_command,
            commands::process::kill_process,
            commands::monitor::get_process_status,
            commands::monitor::has_blocking_processes,
            commands::regenerate::regenerate_project,
            commands::shader::get_shader_worker_status,
            commands::shader::set_shader_worker_priority,
            commands::umap::run_map_command,
            commands::umap::run_build_lighting,
            commands::uproject::run_cook,
            commands::uproject::run_package,
            commands::uproject::run_build,
            commands::plugin::list_plugins_for_project,
            commands::plugin::build_plugin,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
