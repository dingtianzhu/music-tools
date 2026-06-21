mod metadata;

use metadata::{get_metadata_internal, AudioMetadata};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::image::Image;
use tauri::Manager;
use tauri::Emitter;

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

fn read_file_to_string_lossy(path: &std::path::Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    
    // First, try standard UTF-8
    if let Ok(utf8_str) = String::from_utf8(bytes.clone()) {
        return Some(utf8_str);
    }
    
    // Fallback: try decoding as GB18030 (handles GBK / GB2312)
    let (decoded, _, malformed) = encoding_rs::GB18030.decode(&bytes);
    if !malformed {
        return Some(decoded.into_owned());
    }
    
    // Last resort lossy conversion
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command]
fn read_lyrics(path: String) -> Option<String> {
    let audio_path = std::path::Path::new(&path);
    
    // 1. Try song.lrc
    let lrc_path1 = audio_path.with_extension("lrc");
    if lrc_path1.is_file() {
        if let Some(content) = read_file_to_string_lossy(&lrc_path1) {
            return Some(content);
        }
    }

    // 2. Try song.LRC
    let lrc_path2 = audio_path.with_extension("LRC");
    if lrc_path2.is_file() {
        if let Some(content) = read_file_to_string_lossy(&lrc_path2) {
            return Some(content);
        }
    }

    // 3. Try song.mp3.lrc
    let mut path_str = path.clone();
    path_str.push_str(".lrc");
    let lrc_path3 = std::path::Path::new(&path_str);
    if lrc_path3.is_file() {
        if let Some(content) = read_file_to_string_lossy(&lrc_path3) {
            return Some(content);
        }
    }

    // 4. Try song.mp3.LRC
    let mut path_str_upper = path.clone();
    path_str_upper.push_str(".LRC");
    let lrc_path4 = std::path::Path::new(&path_str_upper);
    if lrc_path4.is_file() {
        if let Some(content) = read_file_to_string_lossy(&lrc_path4) {
            return Some(content);
        }
    }

    // 5. Try case-insensitive filename match in the parent directory
    if let (Some(parent), Some(file_stem)) = (audio_path.parent(), audio_path.file_stem()) {
        if let Some(stem_str) = file_stem.to_str() {
            let stem_lower = stem_str.to_lowercase();
            if let Ok(entries) = std::fs::read_dir(parent) {
                for entry in entries.filter_map(Result::ok) {
                    let entry_path = entry.path();
                    if entry_path.is_file() {
                        if let Some(ext) = entry_path.extension().and_then(|s| s.to_str()) {
                            let ext_lower = ext.to_lowercase();
                            if ext_lower == "lrc" {
                                if let Some(name_str) = entry_path.file_stem().and_then(|s| s.to_str()) {
                                    if name_str.to_lowercase() == stem_lower {
                                        if let Some(content) = read_file_to_string_lossy(&entry_path) {
                                            return Some(content);
                                        }
                                    }
                                    // Handle cases like song.mp3 matching song.mp3.lrc stem
                                    let name_lower = name_str.to_lowercase();
                                    let audio_filename_lower = audio_path.file_name().and_then(|s| s.to_str()).map(|s| s.to_lowercase());
                                    if let Some(audio_fn) = audio_filename_lower {
                                        if name_lower == audio_fn {
                                            if let Some(content) = read_file_to_string_lossy(&entry_path) {
                                                return Some(content);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    None
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
                // Intercept close events to hide windows to tray/background instead of destroying them
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                    let _ = window.emit("main-window-hidden", ());
                } else if window.label() == "lyrics" {
                    api.prevent_close();
                    let _ = window.hide();
                    let _ = window.emit("desktop-lyrics-closed", ());
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
