//! Watcher Service
//! 
//! Unified file system watcher for explorer and git updates.

use notify::{Event, EventKind, RecursiveMode, RecommendedWatcher, Watcher};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use serde::{Deserialize, Serialize};
use tokio::time::{Duration, Instant};

use crate::ignore_rules;
use crate::workspace_cache::WorkspaceCache;

/// Unified File Watcher Service.
///
/// One `notify::Watcher` per workspace root (started by the frontend via
/// `start_fs_watch`). Raw events are coalesced within a debounce window,
/// deduplicated, then fanned out to every consumer:
///   1. Explorer cache invalidation (Rust WorkspaceCache)
///   2. `fs-change` event → webview (tree + open tabs)
///   3. `git-status-refresh` event → Source Control (hint)
///
/// Modules must NOT create their own watchers for the same directory.
///
/// A SECOND `notify::Watcher` lives inside this same service and watches
/// only the `.git` *key files* (`HEAD`, `index`, `MERGE_HEAD`, `rebase-merge`,
/// `rebase-apply`, `refs/**`, `logs/refs/**`). It is NOT a duplicate watch of
/// the working tree — the Explorer watcher intentionally skips `.git`
/// (`WATCHER_EXCLUDE`). Events from this watcher only trigger a Git status
/// refresh (never an Explorer refresh), so external git operations (terminal
/// checkout, `git add`, branch switch from another tool) are picked up through
/// the SAME debounced pipeline.

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FsChangeItem {
    #[serde(rename = "type")]
    pub kind: String,
    pub path: String,
    #[serde(rename = "parentPath")]
    pub parent_path: Option<String>,
    #[serde(rename = "oldPath")]
    pub old_path: Option<String>,
    #[serde(rename = "newPath")]
    pub new_path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FsChangePayload {
    pub changes: Vec<FsChangeItem>,
    /// True when any changed file is `.gitignore` or `.notronignore`.
    /// The frontend should flush and re-scan the full Explorer cache when this
    /// is set — gitignore rules change affects every subdirectory's `is_ignored`.
    #[serde(rename = "gitignoreChanged", default)]
    pub gitignore_changed: bool,
}

pub struct WatcherState {
    pub handles: Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            handles: Mutex::new(HashMap::new()),
        }
    }
}

/// Debounce window. Events within this quiet period are coalesced into
/// one batch instead of triggering N separate re-renders / re-scans.
const DEBOUNCE_MS: u64 = 250;

fn get_parent_path(path: &Path) -> Option<String> {
    path.parent().map(|p| p.to_string_lossy().to_string())
}

/// Register a `NonRecursive` watch for `dir` and every subdirectory
/// under it, **skipping** excluded directories (WATCHER_EXCLUDE) so they are
/// never watched recursively. This is a manual tree walk because a single
/// `RecursiveMode::Recursive` watch cannot selectively skip subtrees.
fn register_tree(watcher: &mut RecommendedWatcher, root: &Path) -> Result<(), String> {
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if ignore_rules::is_watcher_excluded_path(&dir) {
            continue;
        }
        watcher
            .watch(&dir, notify::RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch {}: {}", dir.display(), e))?;
        let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            if let Ok(ft) = entry.file_type() {
                if ft.is_dir() {
                    stack.push(entry.path());
                }
            }
        }
    }
    Ok(())
}

/// Watch only the `.git` key files for Source Control. Non-recursive on
/// `.git` itself (catches `HEAD`, `index`, `MERGE_HEAD`, `ORIG_HEAD`,
/// `rebase-merge/`, `rebase-apply/`, `packed-refs`), plus recursive watches on
/// `refs/**` (branches/tags) and `logs/refs/**` (reflog). Cheap — never
/// `objects/`.
fn register_git_keyfiles(watcher: &mut RecommendedWatcher, root: &Path) -> Result<(), String> {
    let git_dir = root.join(".git");
    if !git_dir.is_dir() {
        return Ok(());
    }
    watcher
        .watch(&git_dir, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch .git {}: {}", git_dir.display(), e))?;

    for sub in ["refs", "logs/refs"] {
        let dir = git_dir.join(sub);
        if dir.is_dir() {
            watcher
                .watch(&dir, RecursiveMode::Recursive)
                .map_err(|e| format!("Failed to watch .git/{} {}: {}", sub, dir.display(), e))?;
        }
    }
    Ok(())
}

fn event_to_items(event: &Event) -> Vec<FsChangeItem> {
    let mut items = Vec::new();
    match event.kind {
        EventKind::Create(_) => {
            if let Some(path) = event.paths.first() {
                items.push(FsChangeItem {
                    kind: "created".to_string(),
                    path: path.to_string_lossy().to_string(),
                    parent_path: get_parent_path(path),
                    old_path: None,
                    new_path: None,
                });
            }
        }
        EventKind::Remove(_) => {
            if let Some(path) = event.paths.first() {
                items.push(FsChangeItem {
                    kind: "deleted".to_string(),
                    path: path.to_string_lossy().to_string(),
                    parent_path: get_parent_path(path),
                    old_path: None,
                    new_path: None,
                });
            }
        }
        EventKind::Modify(notify::event::ModifyKind::Name(notify::event::RenameMode::Both)) => {
            if event.paths.len() >= 2 {
                let old_path = &event.paths[0];
                let new_path = &event.paths[1];
                items.push(FsChangeItem {
                    kind: "renamed".to_string(),
                    path: old_path.to_string_lossy().to_string(),
                    parent_path: None,
                    old_path: Some(old_path.to_string_lossy().to_string()),
                    new_path: Some(new_path.to_string_lossy().to_string()),
                });
            }
        }
        EventKind::Modify(_) => {
            if let Some(path) = event.paths.first() {
                items.push(FsChangeItem {
                    kind: "modified".to_string(),
                    path: path.to_string_lossy().to_string(),
                    parent_path: get_parent_path(path),
                    old_path: None,
                    new_path: None,
                });
            }
        }
        _ => {}
    }
    items
}

/// Coalesce + dedupe. "Latest event wins" per path so a burst of
/// modify events for the same file collapses to a single notification.
fn coalesce(items: Vec<FsChangeItem>) -> Vec<FsChangeItem> {
    let mut by_path: HashMap<String, FsChangeItem> = HashMap::new();
    for item in items {
        let key = item
            .new_path
            .clone()
            .or_else(|| Some(item.path.clone()))
            .unwrap_or_default();
        by_path.insert(key, item);
    }
    by_path.into_values().collect()
}

#[tauri::command]
pub async fn start_fs_watch(
    root: String,
    app: AppHandle,
    state: State<'_, WatcherState>,
    cache: State<'_, WorkspaceCache>,
) -> Result<(), String> {
    {
        let mut handles = state.handles.lock().unwrap();
        if let Some(tx) = handles.remove(&root) {
            let _ = tx.send(());
        }
    }

    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut handles = state.handles.lock().unwrap();
        handles.insert(root.clone(), stop_tx);
    }

    let root_clone = root.clone();
    let app_clone = app.clone();
    let cache_handle = cache.inner().clone();

    tokio::spawn(async move {
        // Working-tree watcher (Explorer).
        let (tx, rx) = mpsc::channel();
        let mut watcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("Failed to create watcher: {}", e);
                return;
            }
        };
        if let Err(e) = register_tree(&mut watcher, Path::new(&root_clone)) {
            eprintln!("Failed to watch {}: {}", root_clone, e);
            return;
        }

        // .git key-file watcher (Source Control only).
        let (gtx, grx) = mpsc::channel();
        let mut git_watcher = match notify::recommended_watcher(gtx) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("Failed to create .git watcher: {}", e);
                return;
            }
        };
        if let Err(e) = register_git_keyfiles(&mut git_watcher, Path::new(&root_clone)) {
            eprintln!("Failed to watch .git key files: {}", e);
        }

        let mut pending: Vec<FsChangeItem> = Vec::new();
        let mut git_dirty = false;
        let mut last_event_time = Instant::now();
        let cache = &cache_handle;

        loop {
            tokio::select! {
                _ = &mut stop_rx => {
                    break;
                }
                _ = tokio::time::sleep(Duration::from_millis(50)) => {
                    // Drain working-tree events.
                    while let Ok(event) = rx.try_recv() {
                        if let Ok(e) = event {
                            for item in event_to_items(&e) {
                                let p = Path::new(&item.path);
                                if !ignore_rules::is_watcher_excluded_path(p) {
                                    pending.push(item);
                                    last_event_time = Instant::now();
                                }
                            }

                            // A newly created directory must be registered so
                            // watch coverage stays effective for fresh subtrees.
                            if let EventKind::Create(_) = e.kind {
                                if let Some(created) = e.paths.first() {
                                    let created = created.as_path();
                                    if created.is_dir()
                                        && !ignore_rules::is_watcher_excluded_path(created)
                                    {
                                        if let Err(err) = register_tree(&mut watcher, created) {
                                            eprintln!(
                                                "watcher: failed to register {}: {}",
                                                created.display(),
                                                err
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Drain .git key-file events (external git activity).
                    while let Ok(event) = grx.try_recv() {
                        if let Ok(e) = event {
                            for path in e.paths {
                                if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                                    if filename.ends_with(".lock") {
                                        continue;
                                    }
                                }
                                git_dirty = true;
                                last_event_time = Instant::now();
                            }
                        }
                    }

                    if (git_dirty || !pending.is_empty())
                        && last_event_time.elapsed() >= Duration::from_millis(DEBOUNCE_MS)
                    {
                        git_dirty = false;

                        if !pending.is_empty() {
                            let batch = std::mem::take(&mut pending);
                            let changes = coalesce(batch);

                            if !changes.is_empty() {
                                // Fan-out (1): invalidate the Explorer cache.
                                for change in &changes {
                                    match change.kind.as_str() {
                                        "deleted" | "renamed" => {
                                            cache.invalidate(&change.path);
                                            if let Some(p) = &change.parent_path {
                                                cache.invalidate(p);
                                            }
                                            if let Some(old) = &change.old_path {
                                                cache.invalidate(old);
                                            }
                                            if let Some(new) = &change.new_path {
                                                cache.invalidate(new);
                                            }
                                        }
                                        _ => {
                                            if let Some(p) = &change.parent_path {
                                                cache.invalidate(p);
                                            }
                                        }
                                    }
                                }

                                let gitignore_changed = changes.iter().any(|c| {
                                    let p = std::path::Path::new(&c.path);
                                    matches!(p.file_name().and_then(|n| n.to_str()),
                                        Some(".gitignore" | ".notronignore"))
                                });
                                let payload = FsChangePayload { changes, gitignore_changed };

                                // Fan-out (2): notify the webview (tree + tabs).
                                let _ = app_clone.emit("fs-change", &payload);

                                // Fan-out (3): hint Git status refresh.
                                // If gitignore changed, refresh immediately (no extra delay)
                                // DETECT-005: Case-only renames (file.txt -> File.txt) on case-insensitive
                                // filesystems (macOS/Windows) may not trigger git status changes due to
                                // core.ignorecase=true. The polling fallback (DETECT-001) will eventually
                                // catch these, but users may need to use `git mv` manually or adjust
                                // core.ignorecase if they want case-only renames to be tracked.
                                // because gitignore changes directly affect git status.
                                let _ = app_clone.emit("git-status-refresh", &payload);
                            }
                        } else {
                            // Only .git internals changed (e.g. external checkout):
                            // Source Control refresh only, no Explorer churn.
                            let _ = app_clone.emit("git-status-refresh", &FsChangePayload { changes: vec![], gitignore_changed: false });
                        }
                    }
                }
            }
        }
        drop(watcher);
        drop(git_watcher);
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_fs_watch(
    root: String,
    state: State<'_, WatcherState>,
) -> Result<(), String> {
    let mut handles = state.handles.lock().unwrap();
    if let Some(tx) = handles.remove(&root) {
        let _ = tx.send(());
    }
    Ok(())
}
