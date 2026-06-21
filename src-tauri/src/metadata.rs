use base64::{engine::general_purpose, Engine as _};
use lofty::prelude::*;
use lofty::read_from_path;
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct AudioMetadata {
    pub path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: f64,         // Duration in seconds
    pub cover: Option<String>, // Base64 data URL e.g. "data:image/jpeg;base64,..."
}

pub fn get_metadata_internal(path_str: &str) -> Option<AudioMetadata> {
    let path = Path::new(path_str);

    // Default title is the filename without extension
    let default_title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string());

    let tagged_file = match read_from_path(path) {
        Ok(f) => f,
        Err(_) => {
            // If lofty fails to read, return basic file name and 0 duration
            return Some(AudioMetadata {
                path: path_str.to_string(),
                title: default_title,
                artist: Some("Unknown Artist".to_string()),
                album: Some("Unknown Album".to_string()),
                duration: 0.0,
                cover: None,
            });
        }
    };

    let properties = tagged_file.properties();
    let duration = properties.duration().as_secs_f64();

    let mut title = None;
    let mut artist = None;
    let mut album = None;
    let mut cover = None;

    if let Some(tag) = tagged_file.primary_tag() {
        title = tag.title().map(|s| s.to_string());
        artist = tag.artist().map(|s| s.to_string());
        album = tag.album().map(|s| s.to_string());

        // Read cover art
        if let Some(picture) = tag.pictures().first() {
            let data = picture.data();
            let mime = picture.mime_type().map(|m| m.as_str()).unwrap_or("image/jpeg");
            let b64 = general_purpose::STANDARD.encode(data);
            cover = Some(format!("data:{};base64,{}", mime, b64));
        }
    }

    Some(AudioMetadata {
        path: path_str.to_string(),
        title: title.or(default_title),
        artist: artist.or_else(|| Some("Unknown Artist".to_string())),
        album: album.or_else(|| Some("Unknown Album".to_string())),
        duration,
        cover,
    })
}
