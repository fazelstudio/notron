//! Workspace Cache
//! 
//! In-memory cache for explorer directory listings.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tauri::{ipc::Channel, State};

use crate::file_ops::FileNode;
use crate::ignore_rules;
use crate::stream::StreamedBatch;

/// "Light read model in front, heavy I/O behind, cache in the middle."
///
/// The WorkspaceCache is the Rust-side source of truth for the Explorer tree.
/// The webview only ever asks for *one* directory level at a time; this cache
/// serves it from memory and only hits the filesystem on a miss. Invalidation
/// happens through the unified file watcher and via mutation commands,
/// so the frontend never re-scans from scratch.
///
/// Locking is granular: the outer map is guarded by a single `RwLock`
/// that is only held to resolve a path to its entry, then per-entry `RwLock`
/// guards are used for the actual read/write of children. A long-running scan
/// for one folder therefore never blocks lookups of unrelated folders (no
/// single giant `Mutex` around the whole application state).
#[derive(Clone)]
pub struct WorkspaceCache {
    entries: Arc<RwLock<HashMap<String, Arc<RwLock<CacheEntry>>>>>,
}

struct CacheEntry {
    show_dot: bool,
    children: Vec<FileNode>,
}

/// Result of a lazy `expand_folder` request: only the direct children
/// of one level (never recursive), served from the in-memory cache on a hit.
#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExpandResult {
    pub path: String,
    pub children: Vec<FileNode>,
    /// Whether this was served from the in-memory cache (false = fresh scan).
    pub cached: bool,
}

impl WorkspaceCache {
    pub fn new() -> Self {
        Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    fn has(&self, path: &str, show_dot: bool) -> bool {
        let map = self.entries.read().unwrap();
        match map.get(path) {
            Some(entry) => entry.read().unwrap().show_dot == show_dot,
            None => false,
        }
    }

    fn get(&self, path: &str, show_dot: bool) -> Option<Vec<FileNode>> {
        let map = self.entries.read().unwrap();
        let entry = map.get(path)?;
        let guard = entry.read().unwrap();
        if guard.show_dot != show_dot {
            return None;
        }
        Some(guard.children.clone())
    }

    fn insert(&self, path: &str, show_dot: bool, children: Vec<FileNode>) {
        let mut map = self.entries.write().unwrap();
        if let Some(entry) = map.get(path) {
            let mut guard = entry.write().unwrap();
            guard.show_dot = show_dot;
            guard.children = children;
            return;
        }
        map.insert(
            path.to_string(),
            Arc::new(RwLock::new(CacheEntry { show_dot, children })),
        );
    }

    /// Invalidate the directory `path` and every cached subdirectory under it.
    pub fn invalidate(&self, path: &str) {
        let prefix = format!("{}{}", path, std::path::MAIN_SEPARATOR);
        self.entries.write().unwrap().retain(|key, _| {
            !(key == path || key.starts_with(prefix.as_str()))
        });
    }

    /// Invalidate the parent directory of `path`.
    pub fn invalidate_parent(&self, path: &str) {
        if let Some(parent) = std::path::Path::new(path).parent() {
            self.invalidate(&parent.to_string_lossy());
        }
    }

    /// Load-or-cache: returns the children of a directory, hitting the
    /// filesystem (off the main thread) only on a cache miss.
    pub async fn get_children(&self, path: &str, show_dot: bool) -> Result<Vec<FileNode>, String> {
        if let Some(cached) = self.get(path, show_dot) {
            return Ok(cached);
        }
        let path_owned = path.to_string();
        let children = tokio::task::spawn_blocking(move || scan_dir_blocking(&path_owned, show_dot))
            .await
            .map_err(|e| e.to_string())??;
        self.insert(path, show_dot, children.clone());
        Ok(children)
    }
}

/// Blocking one-level directory scan. Runs inside spawn_blocking so it never
/// blocks the webview / event loop.
///
/// Dot-files are shown by default and only the hard-exclude list is hidden.
/// Each entry is checked against the workspace gitignore and the result is stored
/// in `FileNode::is_ignored` so the frontend can render them dimmed.
pub fn scan_dir_blocking(path: &str, _show_dot_files: bool) -> Result<Vec<crate::file_ops::FileNode>, String> {
    let dir = std::path::Path::new(path);
    if !dir.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    // Build a gitignore matcher by walking up to find the workspace root.
    // We accumulate all .gitignore files found along the way (git semantics).
    let gitignore: Option<ignore::gitignore::Gitignore> = {
        let mut root = dir.to_path_buf();
        let mut workspace_root: Option<std::path::PathBuf> = None;
        for _ in 0..20 {
            if root.join(".git").exists() {
                workspace_root = Some(root.clone());
                break;
            }
            if root.join(".gitignore").exists() && workspace_root.is_none() {
                workspace_root = Some(root.clone());
            }
            if !root.pop() { break; }
        }
        
        workspace_root.map(|wr| {
            let mut builder = ignore::gitignore::GitignoreBuilder::new(&wr);
            let _ = builder.add(wr.join(".gitignore"));
            let _ = builder.add(wr.join(".git").join("info").join("exclude"));
            let mut cur = dir.to_path_buf();
            while cur != wr {
                let gi = cur.join(".gitignore");
                if gi.exists() {
                    let _ = builder.add(&gi);
                }
                if !cur.pop() { break; }
            }
            builder.build().unwrap_or(ignore::gitignore::Gitignore::empty())
        })
    };

    let mut children = Vec::new();

    let read_dir = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in read_dir.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();

        // Always hide Layer-1 hard-excluded names (`.git`, `.svn`, etc.).
        if ignore_rules::is_explorer_hard_excluded(&name) {
            continue;
        }

        let entry_path = entry.path();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

        // Check if this entry is gitignored (shown but dimmed).
        let is_ignored = gitignore
            .as_ref()
            .map(|gi| gi.matched_path_or_any_parents(&entry_path, is_dir).is_ignore())
            .unwrap_or(false);

        children.push(crate::file_ops::FileNode {
            name,
            path: entry_path.to_string_lossy().into_owned(),
            is_dir,
            has_children: is_dir,
            children: None,
            is_ignored,
        });
    }

    crate::file_ops::sort_nodes(&mut children);
    Ok(children)
}

fn node_for_dir(path: &str, children: Vec<FileNode>) -> FileNode {
    let dir = std::path::Path::new(path);
    FileNode {
        name: dir
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        path: path.to_string(),
        is_dir: true,
        has_children: !children.is_empty(),
        children: Some(children),
        is_ignored: false,
    }
}

/// Canonical lazy-expand command. Returns only the direct children of
/// `path` (never recursive), from the in-memory cache on a hit. The cache is
/// invalidated by the unified file watcher when the folder changes, so repeated
/// expands of the same folder are instant.
#[tauri::command]
pub async fn expand_folder(
    path: String,
    show_dot_files: Option<bool>,
    cache: State<'_, WorkspaceCache>,
) -> Result<ExpandResult, String> {
    let show_dot = show_dot_files.unwrap_or(false);
    let cached = cache.has(&path, show_dot);
    let children = cache.get_children(&path, show_dot).await?;
    Ok(ExpandResult {
        path,
        children,
        cached,
    })
}

/// Stream a directory listing over a Channel, per-batch of 200.
/// Preferred over one giant IPC response for large folders (thousands of
/// entries): the webview can render progressively while the scan continues.
#[tauri::command]
pub async fn read_directory_stream(
    path: String,
    show_dot_files: Option<bool>,
    channel: Channel<StreamedBatch<FileNode>>,
    cache: State<'_, WorkspaceCache>,
) -> Result<(), String> {
    let show_dot = show_dot_files.unwrap_or(false);
    let children = cache.get_children(&path, show_dot).await?;
    let total = children.len();

    let mut meta = HashMap::new();
    meta.insert("total".to_string(), total);

    let batch_size = 200;
    let mut i = 0;
    while i < children.len() {
        let end = (i + batch_size).min(children.len());
        let chunk = children[i..end].to_vec();
        let done = end == children.len();
        let payload = if done {
            StreamedBatch::finish(chunk, meta.clone())
        } else {
            StreamedBatch::batch(chunk, meta.clone())
        };
        channel.send(payload).map_err(|e| e.to_string())?;
        i = end;
    }

    if children.is_empty() {
        let mut meta = HashMap::new();
        meta.insert("total".to_string(), 0);
        channel
            .send(StreamedBatch::finish(Vec::new(), meta))
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Cache-backed one-level directory read (used by Explorer lazy expand).
#[tauri::command]
pub async fn read_directory_cached(
    path: String,
    show_dot_files: Option<bool>,
    cache: State<'_, WorkspaceCache>,
) -> Result<FileNode, String> {
    let show_dot = show_dot_files.unwrap_or(false);
    let children = cache.get_children(&path, show_dot).await?;
    Ok(node_for_dir(&path, children))
}
