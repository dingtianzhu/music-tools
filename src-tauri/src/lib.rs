mod metadata;

use metadata::{get_metadata_internal, AudioMetadata};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::image::Image;
use tauri::Manager;

#[tauri::command]
fn get_audio_metadata(path: String) -> Option<AudioMetadata> {
    get_metadata_internal(&path)
}

#[tauri::command]
fn get_audio_metadata_list(paths: Vec<String>) -> Vec<AudioMetadata> {
    paths
        .into_iter()
        .filter_map(|p| get_metadata_internal(&p))
        .collect()
}

#[tauri::command]
fn scan_directory(path: String) -> Vec<AudioMetadata> {
    let mut results = Vec::new();
    let dir = std::path::Path::new(&path);
    scan_dir_recursive(dir, &mut results, 0);
    results
}

fn scan_dir_recursive(path: &std::path::Path, results: &mut Vec<AudioMetadata>, depth: usize) {
    if depth > 3 {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.filter_map(Result::ok) {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                scan_dir_recursive(&entry_path, results, depth + 1);
            } else if entry_path.is_file() {
                if let Some(ext) = entry_path.extension().and_then(|s| s.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if ext_lower == "mp3" || ext_lower == "wav" || ext_lower == "flac" ||
                       ext_lower == "mp4" || ext_lower == "webm" || ext_lower == "mkv" || ext_lower == "avi" {
                        if let Some(path_str) = entry_path.to_str() {
                            if let Some(meta) = get_metadata_internal(path_str) {
                                results.push(meta);
                            }
                        }
                    }
                }
            }
        }
    }
}

#[tauri::command]
fn read_lyrics(path: String) -> Option<String> {
    let audio_path = std::path::Path::new(&path);
    let lrc_path = audio_path.with_extension("lrc");
    if lrc_path.is_file() {
        std::fs::read_to_string(lrc_path).ok()
    } else {
        None
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Embed 128x128 app icon directly into the binary
            let icon = Image::from_bytes(include_bytes!("../icons/128x128.png"))
                .expect("Failed to load embedded icon");

            let show_i = MenuItemBuilder::with_id("show", "显示播放器").build(app)?;
            let quit_i = MenuItemBuilder::with_id("quit", "退出").build(app)?;

            let menu = MenuBuilder::new(app).items(&[&show_i, &quit_i]).build()?;

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Intercept close events on main window to hide it to tray instead
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_audio_metadata,
            get_audio_metadata_list,
            scan_directory,
            read_lyrics
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
