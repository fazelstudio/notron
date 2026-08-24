mod config;
mod db;
mod file_ops;
mod ignore_rules;
mod search;
mod startup;
mod stream;
mod symbol_index;
mod watcher_service;
mod workspace_cache;
mod git_service;
mod discord;

use serde::Serialize;
use tauri::{Manager, Emitter};

/// Logical width/height (and minimum bounds) computed from the primary
/// monitor: new windows start at ~70% of the screen and cannot be resized
/// below ~60%.
fn window_geometry(app_handle: &tauri::AppHandle) -> (f64, f64, f64, f64) {
    if let Ok(Some(monitor)) = app_handle.primary_monitor() {
        let size = monitor.size();
        let scale = monitor.scale_factor();
        let w = size.width as f64 / scale;
        let h = size.height as f64 / scale;
        return (w * 0.7, h * 0.7, w * 0.6, h * 0.6);
    }
    (1200.0, 800.0, 720.0, 480.0)
}

#[tauri::command]
fn show_main_window(window: tauri::Window) -> Result<(), String> {
    if !window.is_maximized().unwrap_or(false) {
        let _ = window.center();
    }
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
async fn open_new_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let label = format!("notron-{}", timestamp);
    let (width, height, min_width, min_height) = window_geometry(&app_handle);
    
    tauri::WebviewWindowBuilder::new(
        &app_handle,
        label,
        tauri::WebviewUrl::App("/?clean=true".into())
    )
    .title("Notron")
    .inner_size(width, height)
    .min_inner_size(min_width, min_height)
    .center()
    .decorations(false)
    .background_color(tauri::window::Color(0xff, 0x1e, 0x1e, 0x1e))
    .visible(false) // Wait for show_main_window
    .build()
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

// ── Startup State: Single IPC round-trip for ALL startup data ──

#[derive(Serialize, Debug, Clone)]
struct StartupState {
    config: config::AppConfig,
    critical: config::CriticalConfig,
    ui_state: Option<db::UiStateRow>,
    session_pairs: Vec<(String, String)>,
    global_settings: std::collections::HashMap<String, serde_json::Value>,
    workspace_settings: std::collections::HashMap<String, serde_json::Value>,
    crash_flag: bool,
}

#[tauri::command]
async fn load_startup_state(
    workspace_id: Option<String>,
    config_state: tauri::State<'_, config::ConfigState>,
    critical_state: tauri::State<'_, config::CriticalConfigState>,
    db_state: tauri::State<'_, db::DbState>,
) -> Result<StartupState, String> {
    // Read config and critical from memory (fast, sync via mutex)
    let app_config = config_state.0.lock().unwrap().clone();
    let critical_config = critical_state.0.lock().unwrap().clone();

    let pool = db_state.0.clone();
    let wid = workspace_id.clone();

    // Parallel DB reads: (1) settings + crash flag, (2) UI + session state.
    // Each uses its own pooled connection so they don't serialize.
    let settings_fut = {
        let pool = pool.clone();
        let wid = wid.clone();
        tokio::task::spawn_blocking(move || {
            let conn = pool.get().map_err(|e| format!("Pool error: {}", e))?;
            let _ = conn.execute_batch("
                PRAGMA cache_size = -65536;
                PRAGMA mmap_size  = 268435456;
                PRAGMA temp_store = MEMORY;
            ");
            let global_settings = db::query_global_settings_map(&conn)?;
            let crash_flag = db::query_crash_flag(&conn)?;
            let workspace_settings = match &wid {
                Some(w) => db::query_workspace_settings_map(&conn, w)?,
                None => std::collections::HashMap::new(),
            };
            Ok::<_, String>((global_settings, workspace_settings, crash_flag))
        })
    };

    let session_fut = {
        let pool = pool.clone();
        let wid = wid.clone();
        tokio::task::spawn_blocking(move || {
            let (ui_state, session_pairs) = if let Some(w) = wid {
                let conn = pool.get().map_err(|e| format!("Pool error: {}", e))?;
                let _ = conn.execute_batch("
                    PRAGMA cache_size = -65536;
                    PRAGMA mmap_size  = 268435456;
                    PRAGMA temp_store = MEMORY;
                ");

                // Query UI state
                let ui = match conn.query_row(
                    "SELECT sidebar_width, panel_height, sidebar_visible, expanded_folder_paths,
                            active_sidebar_panel, is_minimap_enabled
                     FROM ui_state WHERE workspace_id = ?1",
                    rusqlite::params![w],
                    |row| {
                        Ok(db::UiStateRow {
                            sidebar_width: row.get(0)?,
                            panel_height: row.get(1)?,
                            sidebar_visible: row.get::<_, Option<i64>>(2)?.map(|v| v != 0),
                            expanded_folder_paths: row.get(3)?,
                            active_sidebar_panel: row.get(4)?,
                            is_minimap_enabled: row.get::<_, Option<i64>>(5)?.map(|v| v != 0),
                        })
                    },
                ) {
                    Ok(s) => Some(s),
                    Err(rusqlite::Error::QueryReturnedNoRows) => None,
                    Err(e) => return Err(e.to_string()),
                };

                // Query legacy session pairs from workspace_state
                let mut stmt = conn.prepare(
                    "SELECT key, value FROM workspace_state WHERE workspace_path = ?1"
                ).map_err(|e| e.to_string())?;
                let rows = stmt.query_map(rusqlite::params![w], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                }).map_err(|e| e.to_string())?;

                let mut pairs = Vec::new();
                for row in rows {
                    pairs.push(row.map_err(|e| e.to_string())?);
                }

                (ui, pairs)
            } else {
                (None, Vec::new())
            };

            Ok::<_, String>((ui_state, session_pairs))
        })
    };

    let (settings_res, session_res) = tokio::try_join!(settings_fut, session_fut)
        .map_err(|e| e.to_string())?;
    let (global_settings, workspace_settings, crash_flag) = settings_res?;
    let (ui_state, session_pairs) = session_res?;

    Ok(StartupState {
        config: app_config,
        critical: critical_config,
        ui_state,
        session_pairs,
        global_settings,
        workspace_settings,
        crash_flag,
    })
}

#[cfg(debug_assertions)]
fn start_memory_monitor(_app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut sys = sysinfo::System::new();
        let pid = sysinfo::get_current_pid().unwrap();
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
            if let Some(process) = sys.process(pid) {
                let usage = process.memory(); // memory in bytes
                if usage > 500 * 1024 * 1024 { // > 500MB
                    eprintln!("Memory usage high: {}MB", usage / 1024 / 1024);
                } else {
                    println!("Memory usage: {}MB", usage / 1024 / 1024);
                }
            }
        }
    });
}

#[cfg(debug_assertions)]
fn setup_logging() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();
}

#[cfg(not(debug_assertions))]
fn setup_logging(app: &tauri::App) {
    use tracing_appender::rolling;
    let log_dir = app.path().app_log_dir().expect("failed to get log dir");
    std::fs::create_dir_all(&log_dir).expect("failed to create log dir");
    let file_appender = rolling::daily(log_dir, "ide.log");
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::WARN)
        .with_writer(file_appender)
        .init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_pty::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(path) = argv.get(1) {
                let _ = app.emit("open-path", path);
            }
        
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            // Startup timers: every phase below is measured and
            // queryable via `get_startup_timers` / `record_startup_timer`.
            app.manage(startup::StartupTimers::new());
            {
                let timers = app.state::<startup::StartupTimers>();
                timers.record("setup-start");
            }

            #[cfg(debug_assertions)]
            setup_logging();
            
            #[cfg(not(debug_assertions))]
            setup_logging(app);

            // Read critical config synchronously BEFORE anything else
            let critical_cfg = config::read_critical_config(app.handle());
            
            if let Some(window) = app.get_webview_window("main") {
                // Main window always opens full (maximized) on its monitor.
                let (_, _, min_width, min_height) = window_geometry(app.handle());
                let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize {
                    width: min_width,
                    height: min_height,
                })));
                // Windows records the pre-maximize bounds as the size restored
                // on un-maximize. The window is created from tauri.conf.json at
                // 800x600, which can sit BELOW the min size above — so fit the
                // normal size up to the minimum BEFORE maximizing. Restore then
                // can never land below the minimum resize limit.
                let scale = window.scale_factor().unwrap_or(1.0);
                let current = window.inner_size().unwrap_or_default();
                let restore = tauri::LogicalSize::new(
                    (current.width as f64 / scale).max(min_width),
                    (current.height as f64 / scale).max(min_height),
                );
                let _ = window.set_size(tauri::Size::Logical(restore));
                let _ = window.maximize();
            }

            app.manage(config::CriticalConfigState(std::sync::Mutex::new(critical_cfg)));
            {
                let timers = app.state::<startup::StartupTimers>();
                timers.record("critical-config");
            }

            // Initialize DB with connection pool
            let pool = db::init_db(app.handle()).expect("Failed to initialize database");
            app.manage(db::DbState(pool));
            {
                let timers = app.state::<startup::StartupTimers>();
                timers.record("db-init");
            }

            let config = config::load_config(app.handle());
            app.manage(config::ConfigState(std::sync::Mutex::new(config)));

            // Rust-side Explorer cache (source of truth for the tree).
            app.manage(workspace_cache::WorkspaceCache::new());
            // Unified file watcher service (one watcher per workspace root).
            app.manage(watcher_service::WatcherState::new());
            
            app.manage(file_ops::SearchRegistry {
                active_searches: std::sync::Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
            });
            app.manage(git_service::GitState::new(app.handle()));
            app.manage(discord::DiscordState::new());

            // Git detected ONCE at startup (background, non-blocking):
            // fix the macOS shell PATH first, then run the tiered detection and
            // persist the result. The frontend later reads the cached value via
            // `get_git_availability` instead of re-detecting on every command.
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    git_service::fix_macos_shell_path().await;
                    let state = app_handle.state::<git_service::GitState>();
                    let manual = state.manual_path.lock().unwrap().clone();
                    let detected = git_service::detect_git_async(manual.as_deref()).await;
                    {
                        let mut avail = state.availability.lock().unwrap();
                        *avail = detected;
                    }
                    state.persist(&app_handle);
                });
            }

            #[cfg(debug_assertions)]
            start_memory_monitor(app.handle().clone());

            {
                let timers = app.state::<startup::StartupTimers>();
                timers.record("setup-done");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ── Startup ──
            load_startup_state,
            // ── Legacy DB Commands ──
            db::add_recent_file,
            db::get_recent_files,
            db::clear_recent_files,
            db::get_setting,
            db::set_setting,
            db::save_workspace_state,
            db::load_workspace_state,
            db::delete_workspace_state,
            db::save_workspace_sidebar_width,
            db::save_workspace_expanded_paths,
            db::save_workspace_session,
            // ── Tiered Settings Commands ──
            db::load_global_settings,
            db::load_workspace_settings,
            db::save_global_setting,
            db::save_workspace_setting,
            db::delete_workspace_setting,
            // ── Tiered State Commands ──
            db::load_critical_state,
            db::save_critical_state,
            db::load_ui_state,
            db::save_ui_state,
            db::load_session_state,
            db::save_session_state,
            db::check_crash_flag,
            db::set_crash_flag,
            db::save_dirty_tab_snapshots,
            db::get_dirty_tab_snapshots,
            // ── IPC Batch Query ──
            db::batch_query,
            // ── Config ──
            config::get_config,
            config::set_config,
            config::get_critical_config,
            config::save_critical_config,
            // ── File Operations ──
            file_ops::open_file,
            file_ops::open_file_with_meta,
            file_ops::read_file_binary,
            file_ops::read_file_text,
            file_ops::read_file_chunked,
            file_ops::read_file_stream,
            file_ops::save_file,
            file_ops::read_directory,
            file_ops::read_directory_flat,
            file_ops::read_directory_batch,
            file_ops::get_file_info,
            file_ops::file_exists,
            file_ops::is_large_file,
            file_ops::create_directory,
            file_ops::detect_language,
            file_ops::rename_item,
            file_ops::rename_items,
            file_ops::delete_item,
            file_ops::delete_items,
            file_ops::copy_item,
            file_ops::copy_items,
            file_ops::create_file,
            // ── Global Search (ripgrep engine) ──
            search::search_files_stream,
            search::replace_all_files,
            file_ops::cancel_search,
            file_ops::list_all_files,
            // ── File Operations (batch reads) ──
            file_ops::batch_read_files,
            file_ops::get_files_metadata,
            // ── FS Watcher ──
            watcher_service::start_fs_watch,
            watcher_service::stop_fs_watch,
            // ── Workspace Cache / Streaming ──
            workspace_cache::expand_folder,
            workspace_cache::read_directory_stream,
            workspace_cache::read_directory_cached,
            // ── Startup Timers ──
            startup::get_startup_timers,
            startup::record_startup_timer,
            // ── Symbol Index ──
            symbol_index::index_workspace,
            symbol_index::get_symbol_index,
            symbol_index::get_file_symbols,
            symbol_index::goto_definition,
            symbol_index::find_references,
            symbol_index::rename_symbol,
            show_main_window,
            open_new_window,
            // ── Source Control (Git) ──
            git_service::get_git_availability,
            git_service::check_git_availability,
            git_service::re_detect_git,
            git_service::set_git_manual_path,
            git_service::get_repo_state,
            git_service::git_init,
            git_service::git_stage,
            git_service::git_unstage,
            git_service::git_commit,
            git_service::git_discard,
            git_service::git_push,
            git_service::git_publish,
            git_service::git_pull,
            git_service::git_fetch,
            git_service::git_clone,
            git_service::git_cancel_op,
            git_service::get_git_file_content,
            git_service::get_git_file_binary,
            git_service::git_file_diff,
            git_service::git_log,
            git_service::get_commit_files,
            discord::init_discord_presence,
            discord::set_discord_activity,
            discord::clear_discord_presence,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
