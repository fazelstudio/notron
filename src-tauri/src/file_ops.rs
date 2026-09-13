// File Ops
//
// Rust module.
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use encoding_rs::Encoding;
use serde::{Deserialize, Serialize};
use tokio::fs;
use std::collections::HashMap;
use tokio::sync::Mutex;
use tauri::{State, Emitter};
use chardetng::EncodingDetector;

use crate::workspace_cache::WorkspaceCache;

#[derive(Serialize, Deserialize, Debug)]
pub struct FileContent {
    pub content: String,
    pub encoding: String,
    pub size: u64,
    pub line_count: usize,
}

/// Single-IPC result for opening a file.
/// Combines size check + content read into one round-trip.
#[derive(Serialize, Deserialize, Debug)]
pub struct FileOpenMeta {
    pub content: Vec<u8>,
    pub size: u64,
    pub is_large: bool,
}

#[derive(Serialize, Clone)]
pub struct FileChunk {
    pub chunk: String,
    pub done: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FileInfo {
    pub name: String,
    pub extension: String,
    pub size: u64,
    pub last_modified: i64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FileMetadata {
    pub path: String,
    pub size: u64,
    pub modified: Option<u64>,
    pub is_dir: bool,
}

#[derive(Serialize, Deserialize, Debug, Default, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub has_children: bool,
    pub children: Option<Vec<FileNode>>,
    /// True when this entry is matched by .gitignore (shown but visually dimmed,
    /// exactly like VS Code's "ignored" decoration in the Explorer).
    #[serde(default)]
    pub is_ignored: bool,
}

const LARGE_FILE_THRESHOLD: u64 = 1_048_576; // 1MB
// Chunked Loading thresholds
const CHUNK_THRESHOLD_LOW: u64  = 512 * 1024;   // 500KB — load chunked
const CHUNK_THRESHOLD_HIGH: u64 = 5 * 1024 * 1024; // 5MB — disable syntax highlight
const INITIAL_CHUNK_SIZE: usize = 100 * 1024;    // 100KB first chunk

pub struct SearchRegistry {
    pub active_searches: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

#[tauri::command]
pub async fn open_file(path: String) -> Result<FileContent, String> {
    let bytes = fs::read(&path).await.map_err(|e| e.to_string())?;
    let size = bytes.len() as u64;

    if let Ok(content) = String::from_utf8(bytes.clone()) {
        let line_count = content.lines().count();
        return Ok(FileContent {
            content,
            encoding: "UTF-8".to_string(),
            size,
            line_count,
        });
    }

    let (encoding, _confidence, _) = Encoding::for_bom(&bytes)
        .map(|(e, _)| (e, 1.0, false))
        .unwrap_or_else(|| {
            let mut detector = EncodingDetector::new(chardetng::Iso2022JpDetection::Allow);
            detector.feed(&bytes, true);
            (detector.guess(None, chardetng::Utf8Detection::Allow), 0.5, false)
        });

    let (cow, _, _) = encoding.decode(&bytes);
    let content = cow.into_owned();
    let line_count = content.lines().count();

    Ok(FileContent {
        content,
        encoding: encoding.name().to_string(),
        size,
        line_count,
    })
}

#[tauri::command]
pub async fn open_file_with_meta(path: String) -> Result<FileOpenMeta, String> {
    let metadata = fs::metadata(&path).await.map_err(|e| e.to_string())?;
    let size = metadata.len();
    let is_large = size > LARGE_FILE_THRESHOLD;
    let bytes = if is_large {
        Vec::new()
    } else {
        fs::read(&path).await.map_err(|e| e.to_string())?
    };
    Ok(FileOpenMeta { content: bytes, size, is_large })
}

/// Chunked loading for large files.
/// Returns the first INITIAL_CHUNK_SIZE bytes immediately.
/// The caller should use this for files > CHUNK_THRESHOLD_LOW.
#[derive(Serialize, Deserialize, Debug)]
pub struct ChunkedFileResult {
    pub content: String,    // First chunk as text
    pub total_size: u64,
    pub is_complete: bool,  // true if entire file was returned
    pub disable_highlight: bool, // true if > 5MB
}

#[tauri::command]
pub async fn read_file_chunked(path: String) -> Result<ChunkedFileResult, String> {
    use tokio::io::AsyncReadExt;
    let file = tokio::fs::File::open(&path).await.map_err(|e| e.to_string())?;
    let metadata = file.metadata().await.map_err(|e| e.to_string())?;
    let total_size = metadata.len();

    // For files under threshold, read normally
    if total_size <= CHUNK_THRESHOLD_LOW {
        let bytes = tokio::fs::read(&path).await.map_err(|e| e.to_string())?;
        let content = String::from_utf8_lossy(&bytes).replace("\r\n", "\n");
        return Ok(ChunkedFileResult {
            content,
            total_size,
            is_complete: true,
            disable_highlight: false,
        });
    }

    // Read only the first INITIAL_CHUNK_SIZE bytes
    let mut reader = tokio::io::BufReader::new(file);
    let mut buf = vec![0u8; INITIAL_CHUNK_SIZE];
    let n = reader.read(&mut buf).await.map_err(|e| e.to_string())?;
    buf.truncate(n);

    let content = String::from_utf8_lossy(&buf).replace("\r\n", "\n");
    Ok(ChunkedFileResult {
        content,
        total_size,
        is_complete: false,
        disable_highlight: total_size > CHUNK_THRESHOLD_HIGH,
    })
}

#[tauri::command]
pub async fn read_file_stream(
    path: String,
    channel: tauri::ipc::Channel<FileChunk>,
) -> Result<(), String> {
    use tokio::io::AsyncReadExt;
    let mut file = tokio::fs::File::open(&path).await.map_err(|e| e.to_string())?;
    // 512KB chunks
    let mut buf = vec![0u8; 512 * 1024]; 
    loop {
        let n = file.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            let _ = channel.send(FileChunk { chunk: "".to_string(), done: true });
            break;
        }
        let chunk = String::from_utf8_lossy(&buf[..n]).replace("\r\n", "\n");
        let _ = channel.send(FileChunk { chunk, done: false });
    }
    Ok(())
}

#[tauri::command]
pub async fn read_file_binary(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).await.map_err(|e| e.to_string())
}

/// Read file as text directly. Returns String, avoiding the massive JSON array
/// overhead of read_file_binary (which serializes bytes as [72,101,108,...]).
/// For a 100KB file, this reduces IPC payload from ~500KB to ~100KB.
#[tauri::command]
pub async fn read_file_text(path: String) -> Result<String, String> {
    let metadata = fs::metadata(&path).await.map_err(|e| e.to_string())?;
    if metadata.len() > LARGE_FILE_THRESHOLD {
        return Err("__LARGE_FILE__".to_string());
    }

    let bytes = fs::read(&path).await.map_err(|e| e.to_string())?;

    // Check for binary content (NUL bytes in first 8KB)
    let check_len = bytes.len().min(8000);
    for &b in &bytes[..check_len] {
        if b == 0 {
            return Err("__BINARY__".to_string());
        }
    }

    let content = String::from_utf8_lossy(&bytes).replace("\r\n", "\n");
    Ok(content)
}

/// Batch read multiple directories in a single IPC call.
/// Replaces N sequential invoke('read_directory') calls with 1 call.
/// Critical for restoreExpandedChildren() during startup.
#[derive(Serialize, Deserialize, Debug)]
pub struct DirBatchEntry {
    pub path: String,
    pub children: Vec<FileNode>,
}

#[tauri::command]
pub async fn read_directory_batch(
    paths: Vec<String>,
    show_dot_files: Option<bool>,
    cache: State<'_, WorkspaceCache>,
) -> Result<Vec<DirBatchEntry>, String> {
    let show_dot = show_dot_files.unwrap_or(false);

    // All reads go through the shared cache (load-or-cache). Requests
    // are issued concurrently; failed dirs are skipped silently.
    let mut handles = Vec::with_capacity(paths.len());
    for path in paths {
        let cache = cache.inner().clone();
        handles.push(tokio::spawn(async move {
            let children = cache.get_children(&path, show_dot).await?;
            Ok::<DirBatchEntry, String>(DirBatchEntry { path, children })
        }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        match handle.await {
            Ok(Ok(entry)) => results.push(entry),
            Ok(Err(_e)) => {
                // Skip failed directories silently (may have been deleted)
            }
            Err(_e) => {}
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn save_file(
    path: String,
    content: String,
    encoding: Option<String>,
    cache: State<'_, WorkspaceCache>,
) -> Result<(), String> {
    let enc_str = encoding.unwrap_or_else(|| "UTF-8".to_string());
    let enc = Encoding::for_label(enc_str.as_bytes()).unwrap_or(encoding_rs::UTF_8);
    let (cow, _, _) = enc.encode(&content);
    fs::write(&path, cow).await.map_err(|e| e.to_string())?;
    // Drop the stale entry so the next read reflects the write.
    cache.invalidate_parent(&path);
    Ok(())
}

/// Sort nodes: directories first, then by name (case-insensitive).
/// Precomputes lowercase names once per node instead of re-allocating
/// a lowercase String on every comparator call (O(n log n) allocations
/// for large directories).
pub(crate) fn sort_nodes(nodes: &mut Vec<FileNode>) {
    let mut keyed: Vec<(bool, String, usize)> = nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.is_dir, n.name.to_lowercase(), i))
        .collect();
    keyed.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    let sorted: Vec<FileNode> = keyed
        .into_iter()
        .map(|(_, _, i)| std::mem::take(&mut nodes[i]))
        .collect();
    *nodes = sorted;
}

#[allow(dead_code)]
pub fn resolve_symlink_safe(path: &Path, workspace_root: &Path) -> Option<std::path::PathBuf> {
    let resolved = std::fs::canonicalize(path).ok()?;
  
    if resolved == path.parent()? || resolved.starts_with(path) {
        return None;
    }
  
    if !resolved.starts_with(workspace_root) {
        return None;
    }
  
    Some(resolved)
}

/// Reads ONE level of a directory (non-recursive) for lazy loading.
/// Returns a FileNode with immediate children only. Children of subdirectories
/// are not populated (they use empty Vec to save space).
///
/// Served from the Rust WorkspaceCache: cache hit is instant, a miss
/// scans the FS off the main thread and warms the cache.
#[tauri::command]
pub async fn read_directory(
    path: String,
    show_dot_files: Option<bool>,
    cache: State<'_, WorkspaceCache>,
) -> Result<FileNode, String> {
    let show_dot = show_dot_files.unwrap_or(false);
    let children = cache.get_children(&path, show_dot).await?;

    let dir_path = Path::new(&path);
    let name = dir_path.file_name().unwrap_or_default().to_string_lossy().into_owned();
    let path_str = dir_path.to_string_lossy().into_owned();

    Ok(FileNode {
        name,
        path: path_str,
        is_dir: true,
        has_children: !children.is_empty(),
        children: Some(children),
        is_ignored: false,
    })
}

#[tauri::command]
pub async fn read_directory_flat(
    path: String,
    show_dot_files: Option<bool>,
    cache: State<'_, WorkspaceCache>,
) -> Result<Vec<FileNode>, String> {
    let show_dot = show_dot_files.unwrap_or(false);
    // Served from the shared cache like the tree reads.
    cache.get_children(&path, show_dot).await
}

#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo, String> {
    let metadata = fs::metadata(&path).await.map_err(|e| e.to_string())?;
    let path_obj = Path::new(&path);

    let name = path_obj.file_name().unwrap_or_default().to_string_lossy().into_owned();
    let extension = path_obj.extension().unwrap_or_default().to_string_lossy().into_owned();
    let size = metadata.len();

    let last_modified = metadata.modified()
        .map(|time| time.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
        .unwrap_or(0);

    Ok(FileInfo {
        name,
        extension,
        size,
        last_modified,
    })
}

#[tauri::command]
pub async fn is_large_file(path: String) -> Result<bool, String> {
    let metadata = fs::metadata(&path).await.map_err(|e| e.to_string())?;
    Ok(metadata.len() > LARGE_FILE_THRESHOLD)
}

#[derive(Deserialize)]
pub struct MovePair {
    pub old_path: String,
    pub new_path: String,
}

#[derive(Deserialize)]
pub struct CopyPair {
    pub source_path: String,
    pub dest_path: String,
}

#[tauri::command]
pub async fn create_file(path: String, cache: State<'_, WorkspaceCache>, app: tauri::AppHandle) -> Result<(), String> {
    fs::write(&path, "").await.map_err(|e| e.to_string())?;
    cache.invalidate_parent(&path);
    let _ = app.emit("search-invalidate", &path);
    let _ = app.emit("git-invalidate", &path);
    Ok(())
}

#[tauri::command]
pub async fn create_directory(path: String, cache: State<'_, WorkspaceCache>, app: tauri::AppHandle) -> Result<(), String> {
    fs::create_dir_all(&path).await.map_err(|e| e.to_string())?;
    cache.invalidate_parent(&path);
    let _ = app.emit("search-invalidate", &path);
    let _ = app.emit("git-invalidate", &path);
    Ok(())
}

/// Move a file/dir to a new location.
///
/// `std::fs::rename` is instant when source & destination live on the same
/// filesystem (true move, not copy+delete). When the OS reports a cross-device
/// link error (EXDEV), fall back to copy + delete.
async fn move_entry(from: &str, to: &str) -> Result<(), String> {
    match tokio::fs::rename(from, to).await {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::CrossesDevices => {
            let metadata = tokio::fs::metadata(from).await.map_err(|e| e.to_string())?;
            if metadata.is_dir() {
                copy_dir_recursive(from, to).await?;
                tokio::fs::remove_dir_all(from).await.map_err(|e| e.to_string())?;
            } else {
                tokio::fs::copy(from, to).await.map_err(|e| e.to_string())?;
                tokio::fs::remove_file(from).await.map_err(|e| e.to_string())?;
            }
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn rename_item(
    old_path: String,
    new_path: String,
    cache: State<'_, WorkspaceCache>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    move_entry(&old_path, &new_path).await?;
    cache.invalidate(&old_path);
    cache.invalidate_parent(&old_path);
    cache.invalidate_parent(&new_path);
    let _ = app.emit("search-invalidate", &old_path);
    let _ = app.emit("search-invalidate", &new_path);
    let _ = app.emit("git-invalidate", &old_path);
    let _ = app.emit("git-invalidate", &new_path);
    Ok(())
}

#[tauri::command]
pub async fn rename_items(
    moves: Vec<MovePair>,
    cache: State<'_, WorkspaceCache>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    for m in moves {
        if let Err(e) = move_entry(&m.old_path, &m.new_path).await {
            eprintln!("Failed to rename {}: {}", m.old_path, e);
            continue;
        }
        cache.invalidate(&m.old_path);
        cache.invalidate_parent(&m.old_path);
        cache.invalidate_parent(&m.new_path);
        let _ = app.emit("search-invalidate", &m.old_path);
        let _ = app.emit("search-invalidate", &m.new_path);
        let _ = app.emit("git-invalidate", &m.old_path);
        let _ = app.emit("git-invalidate", &m.new_path);
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_item(path: String, cache: State<'_, WorkspaceCache>, app: tauri::AppHandle) -> Result<(), String> {
    let metadata = fs::metadata(&path).await.map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        fs::remove_dir_all(&path).await.map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&path).await.map_err(|e| e.to_string())?;
    }
    cache.invalidate(&path);
    cache.invalidate_parent(&path);
    let _ = app.emit("search-invalidate", &path);
    let _ = app.emit("git-invalidate", &path);
    Ok(())
}

#[tauri::command]
pub async fn delete_items(
    paths: Vec<String>,
    cache: State<'_, WorkspaceCache>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    for path in paths {
        let metadata = fs::metadata(&path).await.map_err(|e| e.to_string())?;
        if metadata.is_dir() {
            fs::remove_dir_all(&path).await.map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(&path).await.map_err(|e| e.to_string())?;
        }
        cache.invalidate(&path);
        cache.invalidate_parent(&path);
        let _ = app.emit("search-invalidate", &path);
        let _ = app.emit("git-invalidate", &path);
    }
    Ok(())
}

#[tauri::command]
pub async fn copy_item(
    src_path: String,
    dst_path: String,
    cache: State<'_, WorkspaceCache>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let metadata = fs::metadata(&src_path).await.map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        copy_dir_recursive(&src_path, &dst_path).await?;
    } else {
        fs::copy(&src_path, &dst_path).await.map_err(|e| e.to_string())?;
    }
    cache.invalidate_parent(&dst_path);
    let _ = app.emit("search-invalidate", &dst_path);
    let _ = app.emit("git-invalidate", &dst_path);
    Ok(())
}

#[tauri::command]
pub async fn copy_items(
    copies: Vec<CopyPair>,
    cache: State<'_, WorkspaceCache>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    for c in copies {
        let metadata = fs::metadata(&c.source_path).await.map_err(|e| e.to_string())?;
        if metadata.is_dir() {
            copy_dir_recursive(&c.source_path, &c.dest_path).await?;
        } else {
            fs::copy(&c.source_path, &c.dest_path).await.map_err(|e| e.to_string())?;
        }
        cache.invalidate_parent(&c.dest_path);
        let _ = app.emit("search-invalidate", &c.dest_path);
        let _ = app.emit("git-invalidate", &c.dest_path);
    }
    Ok(())
}

use std::future::Future;
use std::pin::Pin;

fn copy_dir_recursive<'a>(src: &'a str, dst: &'a str) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>> {
    Box::pin(async move {
        fs::create_dir_all(dst).await.map_err(|e| e.to_string())?;
        let mut entries = fs::read_dir(src).await.map_err(|e| e.to_string())?;
        while let Ok(Some(entry)) = entries.next_entry().await {
            let file_type = entry.file_type().await.map_err(|e| e.to_string())?;
            let src_path = entry.path();
            let dst_path = Path::new(dst).join(entry.file_name());
            if file_type.is_dir() {
                copy_dir_recursive(&src_path.to_string_lossy(), &dst_path.to_string_lossy()).await?;
            } else {
                fs::copy(src_path, dst_path).await.map(|_| ()).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })
}

#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    Ok(fs::metadata(path).await.is_ok())
}

#[tauri::command]
pub async fn cancel_search(
    token: Option<String>,
    registry: State<'_, SearchRegistry>,
) -> Result<(), String> {
    if let Some(t) = token {
        if let Some(flag) = registry.active_searches.lock().await.get(&t) {
            flag.store(true, Ordering::Relaxed);
        }
    } else {
        for flag in registry.active_searches.lock().await.values() {
            flag.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}

use std::sync::OnceLock;

static LANGUAGE_MAP: OnceLock<HashMap<String, String>> = OnceLock::new();

// Map for exact filenames (dotfiles and config files without extensions).
// These are matched against the bare filename (no directory part).
static FILENAME_LANGUAGE_MAP: &[(&str, &str)] = &[
    // .env variants → properties/INI highlighter
    (".env", "properties"),
    (".env.local", "properties"),
    (".env.development", "properties"),
    (".env.development.local", "properties"),
    (".env.test", "properties"),
    (".env.test.local", "properties"),
    (".env.production", "properties"),
    (".env.production.local", "properties"),
    (".env.staging", "properties"),
    (".env.example", "properties"),
    (".env.sample", "properties"),
    // git/vcs ignore files → shell (# comments, glob patterns)
    (".gitignore", "shell"),
    (".gitattributes", "properties"),
    (".gitmodules", "properties"),
    (".npmignore", "shell"),
    (".dockerignore", "shell"),
    (".prettierignore", "shell"),
    (".eslintignore", "shell"),
    (".stylelintignore", "shell"),
    // editor / tool config
    (".editorconfig", "properties"),
    (".babelrc", "json"),
    (".eslintrc", "json"),
    (".prettierrc", "json"),
    (".stylelintrc", "json"),
    // shell rc/profile files
    (".bashrc", "shell"),
    (".bash_profile", "shell"),
    (".bash_aliases", "shell"),
    (".zshrc", "shell"),
    (".zprofile", "shell"),
    (".profile", "shell"),
    // Dockerfile variants
    ("Dockerfile", "dockerfile"),
    ("dockerfile", "dockerfile"),
    // Makefile variants
    ("Makefile", "shell"),
    ("makefile", "shell"),
    ("GNUmakefile", "shell"),
    // Lock files
    ("bun.lock", "json"),
    ("composer.lock", "json"),
    ("Cargo.lock", "toml"),
    ("poetry.lock", "toml"),
    ("Pipfile", "toml"),
    ("yarn.lock", "yaml"),
    ("Gemfile.lock", "yaml"),
    ("requirements.txt", "properties"),
    ("constraints.txt", "properties"),
    // Ruby-based config files
    ("Gemfile", "ruby"),
    ("Vagrantfile", "ruby"),
    ("Brewfile", "ruby"),
    ("Rakefile", "ruby"),
    // Groovy
    ("Jenkinsfile", "groovy"),
    // Procfile
    ("Procfile", "properties"),
];

pub fn get_language_from_ext(ext: &str) -> &'static str {
    let map = LANGUAGE_MAP.get_or_init(|| {
        let json_str = include_str!("../../src/lib/constants/languages.json");
        let parsed: HashMap<String, Vec<String>> = serde_json::from_str(json_str).unwrap();
        let mut m = HashMap::new();
        for (lang, exts) in parsed {
            for e in exts {
                m.insert(e, lang.clone());
            }
        }
        m
    });
    
    map.get(ext).map(|s| s.as_str()).unwrap_or("plaintext")
}

#[tauri::command]
pub async fn detect_language(path: String) -> String {
    let p = Path::new(&path);

    // 1. Try exact filename match first (handles dotfiles and extensionless configs).
    if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
        if let Some((_, lang)) = FILENAME_LANGUAGE_MAP.iter().find(|(f, _)| *f == name) {
            return lang.to_string();
        }
    }

    // 2. Fall back to extension-based lookup.
    let ext = p
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    get_language_from_ext(&ext).to_string()
}

/// List all files in the workspace
/// Optionally cap the number of returned files to bound IPC payload + memory.
/// Applies the workspace's Layer-2 ignore rules (search.exclude / search.include)
/// so Quick Open respects the user's Search Exclude settings.
#[tauri::command]
pub async fn list_all_files(
    path: String,
    _exclude_dirs: Option<Vec<String>>,
    max_results: Option<usize>,
    db: State<'_, crate::db::DbState>,
) -> Result<Vec<String>, String> {
    let user_ignore = crate::db::get_ignore_settings(db.inner(), &path).await?;
    let app_ignore_lines =
        crate::ignore_rules::effective_ignore_lines(&user_ignore.search_exclude, &user_ignore.search_include);

    tokio::task::spawn_blocking(move || {
        let mut results = Vec::new();
        let max_results = max_results.unwrap_or(usize::MAX);

        let builder =
            crate::ignore_rules::workspace_walker(Path::new(&path), true, &app_ignore_lines);

        for result in builder.build() {
            if let Ok(entry) = result {
                if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    results.push(entry.path().to_string_lossy().into_owned());
                    if results.len() >= max_results {
                        break;
                    }
                }
            }
        }
        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Batch read multiple files in one IPC call (restores other tabs at startup)
#[tauri::command]
pub async fn batch_read_files(
    paths: Vec<String>,
) -> Result<std::collections::HashMap<String, Option<String>>, String> {
    use std::collections::HashMap;
    let mut result = HashMap::new();

    let handles: Vec<_> = paths.into_iter().map(|path| {
        let p = path.clone();
        (path, tokio::spawn(async move {
            tokio::fs::read(&p).await.ok().and_then(|bytes| {
                if bytes.iter().take(8192).any(|&b| b == 0) {
                    return None;
                }
                String::from_utf8(bytes).ok()
            })
        }))
    }).collect();

    for (path, handle) in handles {
        match handle.await {
            Ok(content) => { result.insert(path, content); }
            Err(_) => { result.insert(path, None); }
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn get_files_metadata(paths: Vec<String>) -> Result<Vec<FileMetadata>, String> {
    let mut handles = Vec::new();
    for path in paths {
        let p = path.clone();
        handles.push(tokio::spawn(async move {
            tokio::fs::metadata(&p).await.map(|m| FileMetadata {
                path: p,
                size: m.len(),
                modified: m.modified().ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs()),
                is_dir: m.is_dir(),
            })
        }));
    }
  
    let mut results = Vec::new();
    for handle in handles {
        if let Ok(Ok(meta)) = handle.await {
            results.push(meta);
        }
    }
    Ok(results)
}

/// Detected encoding and line ending style for a file (CORE-005).
#[derive(Serialize, Deserialize, Debug)]
pub struct FileEncodingInfo {
    pub encoding: String,
    pub line_ending: String,
}

/// Detect the character encoding (BOM → chardetng fallback) and line ending
/// style (LF vs CRLF) of a file without returning its full content.
#[tauri::command]
pub async fn get_file_encoding_info(path: String) -> Result<FileEncodingInfo, String> {
    let bytes = fs::read(&path).await.map_err(|e| e.to_string())?;

    // Encoding detection (same logic as open_file)
    let encoding = if let Ok(_content) = String::from_utf8(bytes.clone()) {
        // Valid UTF-8 — check BOM
        if bytes.len() >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF {
            "UTF-8 BOM".to_string()
        } else {
            "UTF-8".to_string()
        }
    } else {
        let (enc, _confidence, _) = Encoding::for_bom(&bytes)
            .map(|(e, _)| (e, 1.0, false))
            .unwrap_or_else(|| {
                let mut detector = EncodingDetector::new(chardetng::Iso2022JpDetection::Allow);
                detector.feed(&bytes, true);
                (detector.guess(None, chardetng::Utf8Detection::Allow), 0.5, false)
            });
        enc.name().to_string()
    };

    // Line ending detection — check the first few KB
    let check_len = bytes.len().min(8000);
    let has_crlf = bytes[..check_len].windows(2).any(|w| w == b"\r\n");
    let line_ending = if has_crlf { "CRLF".to_string() } else { "LF".to_string() };

    Ok(FileEncodingInfo {
        encoding,
        line_ending,
    })
}
