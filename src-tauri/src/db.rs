//! Database
//! 
//! SQLite persistence with connection pooling for settings and session state.

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{Connection, Result as SqlResult, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

/// Connection pool replaces single Mutex<Connection>.
/// Allows parallel queries — critical for startup performance.
pub struct DbState(pub Pool<SqliteConnectionManager>);

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RecentFile {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub opened_at: i64,
    pub file_type: String,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Bookmark {
    pub id: i64,
    pub file_path: String,
    pub line_number: i64,
    pub label: String,
    pub created_at: i64,
}

// Tiered state structures for staged startup.

/// Tier 1: Critical State — must load before first render (<20ms)
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct CriticalState {
    pub window_width: Option<i64>,
    pub window_height: Option<i64>,
    pub window_x: Option<i64>,
    pub window_y: Option<i64>,
    pub active_workspace_id: Option<String>,
    pub active_tab_path: Option<String>,
}

/// Tier 2: UI State — layout info (<50ms)
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct UiStateRow {
    pub sidebar_width: Option<i64>,
    pub panel_height: Option<i64>,
    pub sidebar_visible: Option<bool>,
    pub expanded_folder_paths: Option<String>,
    pub active_sidebar_panel: Option<String>,
    pub is_minimap_enabled: Option<bool>,
}

/// Tier 3: Session State — tab metadata (<300ms, can be background)
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct SessionStateRow {
    pub open_tabs_json: Option<String>,
    pub active_tab_id: Option<String>,
    pub scroll_positions_json: Option<String>,
    pub editor_snapshots_json: Option<String>,
}

// IPC batch query types
#[derive(Deserialize, Debug, Clone)]
pub struct BatchOperation {
    pub op: String,
    pub args: Value,
}

#[derive(Serialize, Debug, Clone)]
pub struct BatchResult {
    pub ok: bool,
    pub data: Value,
    pub error: Option<String>,
}

const SCHEMA_VERSION: i64 = 4;

/// Initialize DB with connection pool (3 connections).
/// PRAGMAs are applied per-connection via r2d2 customizer.
pub fn init_db(app_handle: &AppHandle) -> Result<Pool<SqliteConnectionManager>, String> {
    let app_dir = app_handle.path().app_data_dir().expect("failed to get app data dir");
    std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");
    let db_path = app_dir.join("notron_db.sqlite");

    let manager = SqliteConnectionManager::file(&db_path);

    let pool = Pool::builder()
        .max_size(4)
        .build(manager)
        .map_err(|e| format!("Failed to create pool: {}", e))?;

    // Apply PRAGMAs and create schema on the first connection
    {
        let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;
        apply_pragmas(&conn).map_err(|e| format!("PRAGMA error: {}", e))?;
        create_schema(&conn).map_err(|e| format!("Schema error: {}", e))?;
    }

    Ok(pool)
}

fn apply_pragmas(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch("
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous  = NORMAL;
        PRAGMA cache_size   = -65536;
        PRAGMA mmap_size    = 268435456;
        PRAGMA temp_store   = MEMORY;
        PRAGMA foreign_keys = ON;
    ")
}

fn create_schema(conn: &Connection) -> SqlResult<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS recent_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            opened_at INTEGER NOT NULL,
            file_type TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS global_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS workspace_settings (
            workspace_id TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            PRIMARY KEY (workspace_id, key)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL,
            line_number INTEGER NOT NULL,
            label TEXT,
            created_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS workspace_state (
            workspace_path TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            PRIMARY KEY (workspace_path, key)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS critical_state (
            workspace_id TEXT PRIMARY KEY,
            window_width  INTEGER,
            window_height INTEGER,
            window_x      INTEGER,
            window_y      INTEGER,
            active_tab_path TEXT,
            updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS ui_state (
            workspace_id          TEXT PRIMARY KEY,
            sidebar_width         INTEGER,
            panel_height          INTEGER,
            sidebar_visible       INTEGER,
            expanded_folder_paths TEXT,
            active_sidebar_panel  TEXT,
            is_minimap_enabled    INTEGER,
            updated_at            INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS session_state (
            workspace_id          TEXT PRIMARY KEY,
            open_tabs_json        TEXT,
            active_tab_id         TEXT,
            scroll_positions_json TEXT,
            editor_snapshots_json TEXT,
            updated_at            INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS dirty_tab_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL,
            content TEXT NOT NULL,
            cursor_pos INTEGER NOT NULL
        )",
        [],
    )?;

    let current_version: i64 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |row| row.get(0))
        .unwrap_or(0);

    if current_version < SCHEMA_VERSION {
        run_migrations(conn, current_version)?;
    }

    conn.execute_batch("
        CREATE INDEX IF NOT EXISTS idx_recent_files_opened    ON recent_files(opened_at DESC);
        CREATE INDEX IF NOT EXISTS idx_workspace_state_ws     ON workspace_state(workspace_path);
        CREATE INDEX IF NOT EXISTS idx_bookmarks_file         ON bookmarks(file_path);
        CREATE INDEX IF NOT EXISTS idx_ui_state_workspace     ON ui_state(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_session_state_ws       ON session_state(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_critical_state_ws      ON critical_state(workspace_id);
    ")?;

    Ok(())
}

fn run_migrations(conn: &Connection, from_version: i64) -> SqlResult<()> {
    if from_version < 1 {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS workspace_state (
                workspace_path TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
                PRIMARY KEY (workspace_path, key)
            )",
            [],
        )?;
    }
    if from_version < 2 {
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS critical_state (
                workspace_id TEXT PRIMARY KEY,
                window_width  INTEGER, window_height INTEGER,
                window_x      INTEGER, window_y      INTEGER,
                active_tab_path TEXT,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            );
            CREATE TABLE IF NOT EXISTS ui_state (
                workspace_id TEXT PRIMARY KEY,
                sidebar_width INTEGER, panel_height INTEGER,
                sidebar_visible INTEGER, expanded_folder_paths TEXT,
                active_sidebar_panel TEXT, is_minimap_enabled INTEGER,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            );
            CREATE TABLE IF NOT EXISTS session_state (
                workspace_id TEXT PRIMARY KEY,
                open_tabs_json TEXT, active_tab_id TEXT,
                scroll_positions_json TEXT, editor_snapshots_json TEXT,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            );
        ")?;
    }
    if from_version < 3 {
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS global_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            );
            CREATE TABLE IF NOT EXISTS workspace_settings (
                workspace_id TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
                PRIMARY KEY (workspace_id, key)
            );
        ")?;
    }
    if from_version < 4 {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS dirty_tab_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL,
                content TEXT NOT NULL,
                cursor_pos INTEGER NOT NULL
            )",
            [],
        )?;
    }
    conn.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (?1)", params![SCHEMA_VERSION])?;
    Ok(())
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// Helper: get connection from pool and run closure on blocking thread.
/// This is the replacement for the old with_db that used Mutex<Connection>.
async fn with_db<F, R>(state: &DbState, f: F) -> Result<R, String>
where
    F: FnOnce(&Connection) -> Result<R, String> + Send + 'static,
    R: Send + 'static,
{
    let pool = state.0.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| format!("Pool error: {}", e))?;
        // Apply PRAGMAs on each connection from pool (WAL mode persists per-file,
        // but cache_size/mmap_size are per-connection)
        let _ = conn.execute_batch("
            PRAGMA cache_size = -65536;
            PRAGMA mmap_size  = 268435456;
            PRAGMA temp_store = MEMORY;
        ");
        f(&conn)
    })
    .await
    .map_err(|e| e.to_string())?
}

// Legacy commands (kept for backwards compat)

#[tauri::command]
pub async fn add_recent_file(
    path: String,
    name: String,
    file_type: String,
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    with_db(&state, move |conn| {
        let now = now_secs();
        conn.execute(
            "INSERT INTO recent_files (path, name, opened_at, file_type)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(path) DO UPDATE SET opened_at = ?3",
            params![path, name, now, file_type],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn get_recent_files(state: tauri::State<'_, DbState>) -> Result<Vec<RecentFile>, String> {
    with_db(&state, move |conn| {
        let mut stmt = conn.prepare(
            "SELECT id, path, name, opened_at, file_type FROM recent_files ORDER BY opened_at DESC LIMIT 20"
        ).map_err(|e| e.to_string())?;
        let files_iter = stmt.query_map([], |row| {
            Ok(RecentFile { id: row.get(0)?, path: row.get(1)?, name: row.get(2)?, opened_at: row.get(3)?, file_type: row.get(4)? })
        }).map_err(|e| e.to_string())?;
        let mut files = Vec::new();
        for file in files_iter { files.push(file.map_err(|e| e.to_string())?); }
        Ok(files)
    }).await
}

#[tauri::command]
pub async fn clear_recent_files(state: tauri::State<'_, DbState>) -> Result<(), String> {
    with_db(&state, move |conn| {
        conn.execute("DELETE FROM recent_files", []).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn get_setting(key: String, state: tauri::State<'_, DbState>) -> Result<Option<String>, String> {
    let k = key.clone();
    with_db(&state, move |conn| {
        let mut stmt = conn.prepare("SELECT value FROM global_settings WHERE key = ?1").map_err(|e| e.to_string())?;
        let mut rows = stmt.query(params![k]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let value: String = row.get(0).map_err(|e| e.to_string())?;
            Ok(Some(value))
        } else {
            Ok(None)
        }
    }).await
}

#[tauri::command]
pub async fn set_setting(key: String, value: String, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let k = key.clone();
    let v = value.clone();
    with_db(&state, move |conn| {
        conn.execute(
            "INSERT INTO global_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
            params![k, v],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn save_workspace_state(
    workspace_path: String,
    pairs: Vec<(String, String)>,
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let wp = workspace_path.clone();
    let prs = pairs.clone();
    with_db(&state, move |conn| {
        let now = now_secs();
        conn.execute("BEGIN TRANSACTION", []).map_err(|e| e.to_string())?;
        for (key, value) in &prs {
            conn.execute(
                "INSERT INTO workspace_state (workspace_path, key, value, updated_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(workspace_path, key) DO UPDATE SET value = ?3, updated_at = ?4",
                params![wp, key, value, now],
            ).map_err(|e| e.to_string())?;
        }
        conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn load_workspace_state(
    workspace_path: String,
    state: tauri::State<'_, DbState>,
) -> Result<Vec<(String, String)>, String> {
    let wp = workspace_path.clone();
    with_db(&state, move |conn| {
        let mut stmt = conn.prepare(
            "SELECT key, value FROM workspace_state WHERE workspace_path = ?1"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![wp], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for row in rows { result.push(row.map_err(|e| e.to_string())?); }
        Ok(result)
    }).await
}

#[tauri::command]
pub async fn delete_workspace_state(
    workspace_path: String,
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let wp = workspace_path.clone();
    with_db(&state, move |conn| {
        conn.execute(
            "DELETE FROM workspace_state WHERE workspace_path = ?1",
            params![wp],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn save_workspace_sidebar_width(
    workspace_path: String,
    width: i32,
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let wp = workspace_path.clone();
    with_db(&state, move |conn| {
        let now = now_secs();
        conn.execute(
            "INSERT INTO workspace_state (workspace_path, key, value, updated_at) VALUES (?1, 'sidebar_width', ?2, ?3)
             ON CONFLICT(workspace_path, key) DO UPDATE SET value = ?2, updated_at = ?3",
            params![wp, width.to_string(), now],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn save_workspace_expanded_paths(
    workspace_path: String,
    paths_json: String,
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let wp = workspace_path.clone();
    let pj = paths_json.clone();
    with_db(&state, move |conn| {
        let now = now_secs();
        conn.execute(
            "INSERT INTO workspace_state (workspace_path, key, value, updated_at) VALUES (?1, 'expanded_paths', ?2, ?3)
             ON CONFLICT(workspace_path, key) DO UPDATE SET value = ?2, updated_at = ?3",
            params![wp, pj, now],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn save_workspace_session(
    workspace_path: String,
    session_json: String,
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let wp = workspace_path.clone();
    let sj = session_json.clone();
    with_db(&state, move |conn| {
        let now = now_secs();
        conn.execute("BEGIN TRANSACTION", []).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO workspace_state (workspace_path, key, value, updated_at) VALUES (?1, 'session', ?2, ?3)
             ON CONFLICT(workspace_path, key) DO UPDATE SET value = ?2, updated_at = ?3",
            params![wp, sj, now],
        ).map_err(|e| e.to_string())?;
        conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

// Tiered Settings Commands

pub fn query_global_settings_map(conn: &Connection) -> Result<std::collections::HashMap<String, Value>, String> {
    let mut stmt = conn.prepare("SELECT key, value FROM global_settings").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;

    let mut map = std::collections::HashMap::new();
    for row in rows {
        if let Ok((k, v)) = row {
            let parsed: Value = serde_json::from_str(&v).unwrap_or(Value::Null);
            map.insert(k, parsed);
        }
    }
    Ok(map)
}

pub fn query_workspace_settings_map(conn: &Connection, workspace_id: &str) -> Result<std::collections::HashMap<String, Value>, String> {
    let mut stmt = conn.prepare("SELECT key, value FROM workspace_settings WHERE workspace_id = ?1").map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![workspace_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;

    let mut map = std::collections::HashMap::new();
    for row in rows {
        if let Ok((k, v)) = row {
            let parsed: Value = serde_json::from_str(&v).unwrap_or(Value::Null);
            map.insert(k, parsed);
        }
    }
    Ok(map)
}

/// Read the crash flag (stored as a global_settings row).
pub fn query_crash_flag(conn: &Connection) -> Result<bool, String> {
    let mut stmt = conn.prepare("SELECT value FROM global_settings WHERE key = 'crash_flag'").map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let value: String = row.get(0).map_err(|e| e.to_string())?;
        Ok(value == "true")
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn load_global_settings(state: tauri::State<'_, DbState>) -> Result<std::collections::HashMap<String, Value>, String> {
    with_db(&state, |conn| query_global_settings_map(conn)).await
}

#[tauri::command]
pub async fn load_workspace_settings(workspace_id: String, state: tauri::State<'_, DbState>) -> Result<std::collections::HashMap<String, Value>, String> {
    let wid = workspace_id.clone();
    with_db(&state, move |conn| query_workspace_settings_map(conn, &wid)).await
}

#[tauri::command]
pub async fn save_global_setting(key: String, value: Value, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let k = key.clone();
    let v = serde_json::to_string(&value).unwrap_or_else(|_| "null".to_string());
    with_db(&state, move |conn| {
        let now = now_secs();
        conn.execute(
            "INSERT INTO global_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
            params![k, v, now],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn save_workspace_setting(workspace_id: String, key: String, value: Value, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let wid = workspace_id.clone();
    let k = key.clone();
    let v = serde_json::to_string(&value).unwrap_or_else(|_| "null".to_string());
    with_db(&state, move |conn| {
        let now = now_secs();
        conn.execute(
            "INSERT INTO workspace_settings (workspace_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(workspace_id, key) DO UPDATE SET value = ?3, updated_at = ?4",
            params![wid, k, v, now],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn delete_workspace_setting(workspace_id: String, key: String, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let wid = workspace_id.clone();
    let k = key.clone();
    with_db(&state, move |conn| {
        conn.execute(
            "DELETE FROM workspace_settings WHERE workspace_id = ?1 AND key = ?2",
            params![wid, k],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

/// Effective user-configured ignore rules for a workspace: `search_exclude`
/// and `search_include` (gitignore-style patterns; `search_include` entries are
/// negated with `!` in the rendered ignore file). Global settings are merged
/// first, workspace settings appended last so they win. Used
/// by workspace-wide scans (Search, Quick Open) to build the Layer-2 app
/// ignore file.
#[derive(Debug, Clone, Default)]
pub struct IgnoreUserSettings {
    pub search_exclude: Vec<String>,
    pub search_include: Vec<String>,
}

pub async fn get_ignore_settings(
    state: &DbState,
    workspace_path: &str,
) -> Result<IgnoreUserSettings, String> {
    fn str_list(v: &Value) -> Vec<String> {
        v.as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default()
    }

    let wid = workspace_path.to_string();
    with_db(state, move |conn| {
        let mut result = IgnoreUserSettings::default();
        let global = query_global_settings_map(conn)?;
        let ws = query_workspace_settings_map(conn, &wid)?;
        for map in [&global, &ws] {
            for (k, v) in map {
                match k.as_str() {
                    "search_exclude" => result.search_exclude.extend(str_list(v)),
                    "search_include" => result.search_include.extend(str_list(v)),
                    _ => {}
                }
            }
        }
        Ok(result)
    })
    .await
}

// Tiered State Load/Save Commands

#[tauri::command]
pub async fn load_critical_state(
    workspace_id: String,
    state: tauri::State<'_, DbState>,
) -> Result<CriticalState, String> {
    let wid = workspace_id.clone();
    with_db(&state, move |conn| {
        let result = conn.query_row(
            "SELECT window_width, window_height, window_x, window_y, active_tab_path
             FROM critical_state WHERE workspace_id = ?1",
            params![wid],
            |row| {
                Ok(CriticalState {
                    active_workspace_id: Some(wid.clone()),
                    window_width: row.get(0)?,
                    window_height: row.get(1)?,
                    window_x: row.get(2)?,
                    window_y: row.get(3)?,
                    active_tab_path: row.get(4)?,
                })
            },
        );

        match result {
            Ok(s) => Ok(s),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(CriticalState {
                active_workspace_id: Some(wid),
                ..Default::default()
            }),
            Err(e) => Err(e.to_string()),
        }
    }).await
}

#[tauri::command]
pub async fn save_critical_state(
    workspace_id: String,
    critical: CriticalState,
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let wid = workspace_id.clone();
    let crit = critical.clone();
    with_db(&state, move |conn| {
        let now = now_secs();
        conn.execute(
            "INSERT INTO critical_state (workspace_id, window_width, window_height, window_x, window_y, active_tab_path, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(workspace_id) DO UPDATE SET
               window_width=?2, window_height=?3, window_x=?4, window_y=?5,
               active_tab_path=?6, updated_at=?7",
            params![
                wid,
                crit.window_width, crit.window_height,
                crit.window_x, crit.window_y,
                crit.active_tab_path, now
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn load_ui_state(
    workspace_id: String,
    state: tauri::State<'_, DbState>,
) -> Result<UiStateRow, String> {
    let wid = workspace_id.clone();
    with_db(&state, move |conn| {
        let result = conn.query_row(
            "SELECT sidebar_width, panel_height, sidebar_visible, expanded_folder_paths,
                    active_sidebar_panel, is_minimap_enabled
             FROM ui_state WHERE workspace_id = ?1",
            params![wid],
            |row| {
                Ok(UiStateRow {
                    sidebar_width: row.get(0)?,
                    panel_height: row.get(1)?,
                    sidebar_visible: row.get::<_, Option<i64>>(2)?.map(|v| v != 0),
                    expanded_folder_paths: row.get(3)?,
                    active_sidebar_panel: row.get(4)?,
                    is_minimap_enabled: row.get::<_, Option<i64>>(5)?.map(|v| v != 0),
                })
            },
        );

        match result {
            Ok(s) => Ok(s),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(UiStateRow::default()),
            Err(e) => Err(e.to_string()),
        }
    }).await
}

#[tauri::command]
pub async fn save_ui_state(
    workspace_id: String,
    ui: UiStateRow,
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let wid = workspace_id.clone();
    let u = ui.clone();
    with_db(&state, move |conn| {
        let now = now_secs();
        let sidebar_visible_i: Option<i64> = u.sidebar_visible.map(|b| b as i64);
        let minimap_i: Option<i64> = u.is_minimap_enabled.map(|b| b as i64);
        conn.execute(
            "INSERT INTO ui_state (workspace_id, sidebar_width, panel_height, sidebar_visible,
              expanded_folder_paths, active_sidebar_panel, is_minimap_enabled, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
             ON CONFLICT(workspace_id) DO UPDATE SET
               sidebar_width=?2, panel_height=?3, sidebar_visible=?4,
               expanded_folder_paths=?5, active_sidebar_panel=?6,
               is_minimap_enabled=?7, updated_at=?8",
            params![wid, u.sidebar_width, u.panel_height, sidebar_visible_i,
                    u.expanded_folder_paths, u.active_sidebar_panel, minimap_i, now],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

#[tauri::command]
pub async fn load_session_state(
    workspace_id: String,
    state: tauri::State<'_, DbState>,
) -> Result<SessionStateRow, String> {
    let wid = workspace_id.clone();
    with_db(&state, move |conn| {
        let result = conn.query_row(
            "SELECT open_tabs_json, active_tab_id, scroll_positions_json, editor_snapshots_json
             FROM session_state WHERE workspace_id = ?1",
            params![wid],
            |row| {
                Ok(SessionStateRow {
                    open_tabs_json: row.get(0)?,
                    active_tab_id: row.get(1)?,
                    scroll_positions_json: row.get(2)?,
                    editor_snapshots_json: row.get(3)?,
                })
            },
        );

        match result {
            Ok(s) => Ok(s),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(SessionStateRow::default()),
            Err(e) => Err(e.to_string()),
        }
    }).await
}

#[tauri::command]
pub async fn save_session_state(
    workspace_id: String,
    session: SessionStateRow,
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let wid = workspace_id.clone();
    let sess = session.clone();
    with_db(&state, move |conn| {
        let now = now_secs();
        conn.execute(
            "INSERT INTO session_state (workspace_id, open_tabs_json, active_tab_id,
              scroll_positions_json, editor_snapshots_json, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6)
             ON CONFLICT(workspace_id) DO UPDATE SET
               open_tabs_json=?2, active_tab_id=?3,
               scroll_positions_json=?4, editor_snapshots_json=?5, updated_at=?6",
            params![wid, sess.open_tabs_json, sess.active_tab_id,
                    sess.scroll_positions_json, sess.editor_snapshots_json, now],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

// Crash Recovery

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DirtyTabData {
    pub path: String,
    pub content: String,
    pub cursor_pos: i64,
}

#[tauri::command]
pub async fn save_dirty_tab_snapshots(tabs: Vec<DirtyTabData>, state: tauri::State<'_, DbState>) -> Result<(), String> {
    with_db(&state, move |conn| {
        conn.execute("DELETE FROM dirty_tab_snapshots", []).map_err(|e| e.to_string())?;
        
        for tab in tabs {
            conn.execute(
                "INSERT INTO dirty_tab_snapshots (path, content, cursor_pos) VALUES (?1, ?2, ?3)",
                params![tab.path, tab.content, tab.cursor_pos],
            ).map_err(|e| e.to_string())?;
        }
        Ok(())
    }).await
}

#[tauri::command]
pub async fn get_dirty_tab_snapshots(state: tauri::State<'_, DbState>) -> Result<Vec<DirtyTabData>, String> {
    with_db(&state, move |conn| {
        let mut stmt = conn.prepare("SELECT path, content, cursor_pos FROM dirty_tab_snapshots").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(DirtyTabData {
                path: row.get(0)?,
                content: row.get(1)?,
                cursor_pos: row.get(2)?,
            })
        }).map_err(|e| e.to_string())?;
        
        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
        Ok(results)
    }).await
}

#[tauri::command]
pub async fn check_crash_flag(state: tauri::State<'_, DbState>) -> Result<bool, String> {
    with_db(&state, |conn| query_crash_flag(conn)).await
}

#[tauri::command]
pub async fn set_crash_flag(value: bool, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let v = if value { "true" } else { "false" };
    with_db(&state, move |conn| {
        let now = now_secs();
        conn.execute(
            "INSERT INTO global_settings (key, value, updated_at) VALUES ('crash_flag', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2",
            params![v, now],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }).await
}

// IPC Batch Query

#[tauri::command]
pub async fn batch_query(
    operations: Vec<BatchOperation>,
    state: tauri::State<'_, DbState>,
) -> Result<Vec<BatchResult>, String> {
    let ops = operations.clone();
    with_db(&state, move |conn| {
        let mut results = Vec::with_capacity(ops.len());
        for op in &ops {
            results.push(execute_batch_op(conn, op));
        }
        Ok(results)
    }).await
}

fn execute_batch_op(conn: &Connection, op: &BatchOperation) -> BatchResult {
    match op.op.as_str() {
        "get_setting" => {
            let key = op.args["key"].as_str().unwrap_or("").to_string();
            match conn.query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |r| r.get::<_, String>(0),
            ) {
                Ok(v) => BatchResult { ok: true, data: Value::String(v), error: None },
                Err(rusqlite::Error::QueryReturnedNoRows) => BatchResult { ok: true, data: Value::Null, error: None },
                Err(e) => BatchResult { ok: false, data: Value::Null, error: Some(e.to_string()) },
            }
        }
        "load_workspace_state" => {
            let workspace_id = op.args["workspace_id"].as_str().unwrap_or("").to_string();
            let pairs_result: Result<Vec<(String, String)>, rusqlite::Error> = (|| {
                let mut stmt = conn.prepare(
                    "SELECT key, value FROM workspace_state WHERE workspace_path = ?1"
                )?;
                let rows = stmt.query_map(params![workspace_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?;
                rows.collect()
            })();
            match pairs_result {
                Ok(pairs) => {
                    let json = serde_json::to_value(pairs).unwrap_or(Value::Null);
                    BatchResult { ok: true, data: json, error: None }
                }
                Err(e) => BatchResult { ok: false, data: Value::Null, error: Some(e.to_string()) },
            }
        }
        "load_critical_state" => {
            let workspace_id = op.args["workspace_id"].as_str().unwrap_or("").to_string();
            match conn.query_row(
                "SELECT window_width, window_height, window_x, window_y, active_tab_path
                 FROM critical_state WHERE workspace_id = ?1",
                params![workspace_id],
                |row| {
                    Ok(CriticalState {
                        active_workspace_id: Some(workspace_id.clone()),
                        window_width: row.get(0)?,
                        window_height: row.get(1)?,
                        window_x: row.get(2)?,
                        window_y: row.get(3)?,
                        active_tab_path: row.get(4)?,
                    })
                },
            ) {
                Ok(s) => BatchResult { ok: true, data: serde_json::to_value(s).unwrap_or(Value::Null), error: None },
                Err(rusqlite::Error::QueryReturnedNoRows) => {
                    let default = CriticalState { active_workspace_id: Some(workspace_id), ..Default::default() };
                    BatchResult { ok: true, data: serde_json::to_value(default).unwrap_or(Value::Null), error: None }
                }
                Err(e) => BatchResult { ok: false, data: Value::Null, error: Some(e.to_string()) },
            }
        }
        "load_ui_state" => {
            let workspace_id = op.args["workspace_id"].as_str().unwrap_or("").to_string();
            match conn.query_row(
                "SELECT sidebar_width, panel_height, sidebar_visible, expanded_folder_paths,
                        active_sidebar_panel, is_minimap_enabled
                 FROM ui_state WHERE workspace_id = ?1",
                params![workspace_id],
                |row| {
                    Ok(UiStateRow {
                        sidebar_width: row.get(0)?,
                        panel_height: row.get(1)?,
                        sidebar_visible: row.get::<_, Option<i64>>(2)?.map(|v| v != 0),
                        expanded_folder_paths: row.get(3)?,
                        active_sidebar_panel: row.get(4)?,
                        is_minimap_enabled: row.get::<_, Option<i64>>(5)?.map(|v| v != 0),
                    })
                },
            ) {
                Ok(s) => BatchResult { ok: true, data: serde_json::to_value(s).unwrap_or(Value::Null), error: None },
                Err(rusqlite::Error::QueryReturnedNoRows) => {
                    BatchResult { ok: true, data: serde_json::to_value(UiStateRow::default()).unwrap_or(Value::Null), error: None }
                }
                Err(e) => BatchResult { ok: false, data: Value::Null, error: Some(e.to_string()) },
            }
        }
        "load_session_state" => {
            let workspace_id = op.args["workspace_id"].as_str().unwrap_or("").to_string();
            match conn.query_row(
                "SELECT open_tabs_json, active_tab_id, scroll_positions_json, editor_snapshots_json
                 FROM session_state WHERE workspace_id = ?1",
                params![workspace_id],
                |row| {
                    Ok(SessionStateRow {
                        open_tabs_json: row.get(0)?,
                        active_tab_id: row.get(1)?,
                        scroll_positions_json: row.get(2)?,
                        editor_snapshots_json: row.get(3)?,
                    })
                },
            ) {
                Ok(s) => BatchResult { ok: true, data: serde_json::to_value(s).unwrap_or(Value::Null), error: None },
                Err(rusqlite::Error::QueryReturnedNoRows) => {
                    BatchResult { ok: true, data: serde_json::to_value(SessionStateRow::default()).unwrap_or(Value::Null), error: None }
                }
                Err(e) => BatchResult { ok: false, data: Value::Null, error: Some(e.to_string()) },
            }
        }
        _ => BatchResult {
            ok: false,
            data: Value::Null,
            error: Some(format!("Unknown batch operation: {}", op.op)),
        },
    }
}
