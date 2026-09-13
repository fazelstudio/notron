// Config
//
// Rust module.
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use std::sync::Mutex;

pub struct ConfigState(pub Mutex<AppConfig>);

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppConfig {
    pub theme: String,
    pub font_size: u32,
    pub font_family: String,
    pub tab_size: u32,
    pub word_wrap: bool,
    pub line_numbers: bool,
    pub auto_save: bool,
    pub auto_save_delay_ms: u32,
    pub default_encoding: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            font_size: 14,
            font_family: "JetBrains Mono, Consolas, monospace".to_string(),
            tab_size: 4,
            word_wrap: false,
            line_numbers: true,
            auto_save: false,
            auto_save_delay_ms: 1000,
            default_encoding: "UTF-8".to_string(),
        }
    }
}

fn get_config_path(app_handle: &AppHandle) -> PathBuf {
    let app_dir = app_handle.path().app_config_dir().expect("failed to get config dir");
    fs::create_dir_all(&app_dir).expect("failed to create config dir");
    app_dir.join("config.toml")
}

pub fn load_config(app_handle: &AppHandle) -> AppConfig {
    let config_path = get_config_path(app_handle);
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(config) = toml::from_str(&content) {
                return config;
            }
        }
    }
    
    let default_config = AppConfig::default();
    save_config_to_file(&config_path, &default_config).ok();
    default_config
}

fn save_config_to_file(path: &PathBuf, config: &AppConfig) -> Result<(), String> {
    let content = toml::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_config(state: tauri::State<ConfigState>) -> Result<AppConfig, String> {
    let lock = state.0.lock().unwrap();
    Ok(lock.clone())
}

#[tauri::command]
pub async fn set_config(
    config: AppConfig,
    state: tauri::State<'_, ConfigState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // Update in-memory state immediately (fast), persist to disk off the
    // main thread so the handler never blocks the event loop.
    {
        let mut lock = state.0.lock().unwrap();
        *lock = config.clone();
    }

    let config_path = get_config_path(&app_handle);
    tokio::task::spawn_blocking(move || save_config_to_file(&config_path, &config))
        .await
        .map_err(|e| e.to_string())?
}

// ── Critical Config (Pre-render sync read) ──

/// Pre-render critical config read synchronously from a small JSON file.
/// NOT from SQLite — SQLite is too slow for pre-render.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CriticalConfig {
    pub theme: String,
    pub window_width: u32,
    pub window_height: u32,
    pub window_x: Option<i32>,
    pub window_y: Option<i32>,
    pub window_maximized: bool,
    pub sidebar_width: u32,
    pub sidebar_visible: bool,
    pub terminal_visible: bool,
    pub terminal_height: u32,
    pub active_workspace: Option<String>,
}

impl Default for CriticalConfig {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            window_width: 1200,
            window_height: 800,
            window_x: None,
            window_y: None,
            window_maximized: true,
            sidebar_width: 240,
            sidebar_visible: true,
            terminal_visible: false,
            terminal_height: 250,
            active_workspace: None,
        }
    }
}

pub struct CriticalConfigState(pub Mutex<CriticalConfig>);

/// Read critical config synchronously from critical.json in app_data_dir.
/// Returns default if file doesn't exist or parse fails.
pub fn read_critical_config(app_handle: &AppHandle) -> CriticalConfig {
    let app_dir = app_handle.path().app_data_dir().expect("failed to get app data dir");
    let path = app_dir.join("critical.json");
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str(&content) {
                return config;
            }
        }
    }
    CriticalConfig::default()
}

/// Save critical config to critical.json in app_data_dir.
pub fn save_critical_config_to_file(app_handle: &AppHandle, config: &CriticalConfig) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().expect("failed to get app data dir");
    fs::create_dir_all(&app_dir).ok();
    let path = app_dir.join("critical.json");
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_critical_config(state: tauri::State<CriticalConfigState>) -> Result<CriticalConfig, String> {
    let lock = state.0.lock().unwrap();
    Ok(lock.clone())
}

#[tauri::command]
pub async fn save_critical_config(
    config: CriticalConfig,
    state: tauri::State<'_, CriticalConfigState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    {
        let mut lock = state.0.lock().unwrap();
        *lock = config.clone();
    }
    // Persist off the main thread.
    tokio::task::spawn_blocking(move || save_critical_config_to_file(&app_handle, &config))
        .await
        .map_err(|e| e.to_string())?
}

