// ── Source Control (Git Integration) ─────────────────────────────────────────
//
// Git is integrated by shelling out to the git CLI (credential-helper
// compatibility + always-latest features) instead of libgit2. Key design
// points:
//
//   * Tiered Git detection: PATH → per-OS common locations → Windows registry /
//     macOS xcode-select → manual override. Results are cached in memory AND
//     persisted to disk, so detection runs once at startup, not on every
//     command. A cached result is only re-detected when a spawned git process
//     reports NotFound (stale path) or the user explicitly re-detects a PATH.
//     This is the root fix for "Git Not Found" — not the library choice.
//   * Explicit state machine: GitAvailability (device-wide) → RepoState
//     (per workspace). Repo status is derived from a SINGLE
//     `git status --porcelain=v2 --branch -z -M` invocation (branch,
//     ahead/behind and every file state in one exec). History (git log)
//     stays lazy & paged.
//   * All operations are async; network ops stream real git progress over a
//     tauri Channel and can be truly cancelled (taskkill/kill on the spawned
//     child pid). A timeout guards every network operation.
//   * DecorationMap is a first-class model keyed by ABSOLUTE path (independent
//     from the Explorer tree), distributed to the frontend as a DELTA
//     (changed/removed), with folder rollups (Conflict > Deleted >
//     Added/Untracked > Modified > Renamed) and rename/copy (R/C) handled as a
//     single record instead of Delete + Untracked.

use std::collections::HashMap;
use std::io::ErrorKind as IoErrorKind;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

// ── Git Availability (device-wide, cached & persisted) ────────────────

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct GitAvailability {
    /// "Unknown" | "Checking" | "Available" | "NotFound"
    pub status: String,
    pub path: Option<String>,
    pub version: Option<String>,
    /// Where the path came from: "manual" | "path" | "common" | "registry" | "xcode"
    #[serde(default)]
    pub source: String,
}

impl GitAvailability {
    fn unknown() -> Self {
        Self { status: "Unknown".to_string(), path: None, version: None, source: String::new() }
    }
    fn available(path: String, version: String, source: &str) -> Self {
        Self { status: "Available".to_string(), path: Some(path), version: Some(version), source: source.to_string() }
    }
    fn not_found() -> Self {
        Self { status: "NotFound".to_string(), path: None, version: None, source: String::new() }
    }
}

/// Persisted detection state (manual override + last detected availability).
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
struct PersistedGitState {
    manual_path: Option<String>,
    availability: Option<GitAvailability>,
}

fn persisted_path(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir());
    dir.join("git_state.json")
}

fn load_persisted(app: &AppHandle) -> PersistedGitState {
    let p = persisted_path(app);
    std::fs::read_to_string(&p)
        .ok()
        .and_then(|s| serde_json::from_str::<PersistedGitState>(&s).ok())
        .unwrap_or_default()
}

fn save_persisted(app: &AppHandle, s: &PersistedGitState) {
    let p = persisted_path(app);
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string_pretty(s) {
        let _ = std::fs::write(p, json);
    }
}

// ── Repo state (per workspace) ────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GitFileStatus {
    /// Path relative to the workspace root (what the Source Control panel shows).
    pub path: String,
    pub status: String, // U, M, D, A, R, C, Conflict
    pub staged: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RepoState {
    /// "Unknown" | "Checking" | "NotARepo" | "Repo"
    pub status: String,
    /// Current branch name. "(detached)" when HEAD is detached.
    pub branch: Option<String>,
    pub has_upstream: bool,
    /// Full upstream ref, e.g. "origin/main". Mirrors VSCode's `HEAD.upstream`.
    #[serde(default)]
    pub upstream: Option<String>,
    /// Remote name of the upstream, e.g. "origin".
    #[serde(default)]
    pub upstream_remote: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    /// Short (8-char) HEAD commit hash. `None` when the branch is unborn
    /// (repo initialized but no commit yet) — VSCode treats this as "no HEAD".
    #[serde(default)]
    pub head_short: Option<String>,
    /// True when the current branch has no commit yet (freshly initialized repo).
    #[serde(default)]
    pub unborn: bool,
    #[serde(default)]
    pub merge_in_progress: bool,
    #[serde(default)]
    pub rebase_in_progress: bool,
    #[serde(default)]
    pub cherry_pick_in_progress: bool,
    /// Names of every configured remote (used for the Publish flow).
    #[serde(default)]
    pub remotes: Vec<String>,
    pub staged: Vec<GitFileStatus>,
    pub unstaged: Vec<GitFileStatus>,
    pub untracked: Vec<GitFileStatus>,
    pub conflicted: Vec<GitFileStatus>,
    #[serde(default)]
    pub last_fetched_ms: Option<u64>,
    pub remote_url: Option<String>,
}

impl RepoState {
    fn not_a_repo() -> Self {
        Self {
            status: "NotARepo".to_string(),
            branch: None,
            has_upstream: false,
            upstream: None,
            upstream_remote: None,
            ahead: 0,
            behind: 0,
            head_short: None,
            unborn: false,
            merge_in_progress: false,
            rebase_in_progress: false,
            cherry_pick_in_progress: false,
            remotes: vec![],
            staged: vec![],
            unstaged: vec![],
            untracked: vec![],
            conflicted: vec![],
            last_fetched_ms: None,
            remote_url: None,
        }
    }
    fn fresh() -> Self {
        Self {
            status: "Repo".to_string(),
            branch: None,
            has_upstream: false,
            upstream: None,
            upstream_remote: None,
            ahead: 0,
            behind: 0,
            head_short: None,
            unborn: false,
            merge_in_progress: false,
            rebase_in_progress: false,
            cherry_pick_in_progress: false,
            remotes: vec![],
            staged: vec![],
            unstaged: vec![],
            untracked: vec![],
            conflicted: vec![],
            last_fetched_ms: Some(now_ms()),
            remote_url: None,
        }
    }
}

// ── Decoration model (keyed by absolute path, separate from the tree) ─

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct GitDecoration {
    /// U, M, D, A, R, C, Conflict
    pub code: String,
    pub staged: bool,
    pub index_code: Option<char>,
    pub worktree_code: Option<char>,
    #[serde(default)]
    pub renamed_from: Option<String>,
    /// True when this entry is an aggregated folder badge, not a file.
    #[serde(default)]
    pub is_rollup: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DecorationDelta {
    pub changed: Vec<(String, GitDecoration)>,
    pub removed: Vec<String>,
}

// ── App state ───────────────────────────────────────────────────────────────

pub struct GitState {
    pub availability: Mutex<GitAvailability>,
    pub manual_path: Mutex<Option<String>>,
    pub decorations: Mutex<HashMap<String, GitDecoration>>,
    /// op_id → child pid for running network operations.
    pub ops: Mutex<HashMap<String, u32>>,
    /// DETECT-008: Serializes write operations (stage/unstage/commit) to prevent
    /// race conditions when the user performs rapid index modifications.
    pub write_op_lock: tokio::sync::Mutex<()>,
}

impl GitState {
    pub fn new(app: &AppHandle) -> Self {
        let persisted = load_persisted(app);
        let availability = persisted.availability.unwrap_or_else(GitAvailability::unknown);
        Self {
            availability: Mutex::new(availability),
            manual_path: Mutex::new(persisted.manual_path),
            decorations: Mutex::new(HashMap::new()),
            ops: Mutex::new(HashMap::new()),
            write_op_lock: tokio::sync::Mutex::new(()),
        }
    }

    pub(crate) fn persist(&self, app: &AppHandle) {
        let manual_path = self.manual_path.lock().unwrap().clone();
        let availability = self.availability.lock().unwrap().clone();
        save_persisted(app, &PersistedGitState { manual_path, availability: Some(availability) });
    }

    /// Path string to use when spawning git ("git" bare fallback is resolved by PATH).
    fn git_command(&self) -> Option<String> {
        let avail = self.availability.lock().unwrap();
        if avail.status != "Available" {
            return None;
        }
        Some(avail.path.clone().unwrap_or_else(|| "git".to_string()))
    }

    /// The configured git binary no longer spawns; forget the cache
    /// so the next probe re-detects instead of failing forever.
    fn invalidate(&self) {
        let mut avail = self.availability.lock().unwrap();
        *avail = GitAvailability::unknown();
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

// ── Command runner ──────────────────────────────────────────────────────────

async fn run_git_raw(
    git: &str,
    args: &[&str],
    cwd: Option<&str>,
    app: Option<&AppHandle>,
) -> Result<std::process::Output, std::io::Error> {
    let start = std::time::Instant::now();
    let mut cmd = Command::new(git);
    if let Ok(path_env) = std::env::var("PATH") {
        cmd.env("PATH", path_env);
    }
    // Prevent git from updating the index or running background fetches,
    // which would trigger the file watcher and cause an infinite refresh loop.
    cmd.env("GIT_OPTIONAL_LOCKS", "0");
    cmd.args(args);
    if let Some(c) = cwd {
        cmd.current_dir(c);
    }
    let res = cmd.output().await;
    let duration = start.elapsed().as_millis();
    if let Some(app) = app {
        let is_spammy = args.starts_with(&["rev-parse", "--is-inside-work-tree"])
            || args.starts_with(&["rev-parse", "--absolute-git-dir"])
            || args.starts_with(&["remote"])
            || args.starts_with(&["config", "--get", "remote.origin.url"])
            || args.starts_with(&["config", "--get", "init.defaultBranch"]);
        
        if !is_spammy {
            let cmd_str = format!("> git {} [{}ms]", args.join(" "), duration);
            let _ = app.emit("git-output", cmd_str);
        }

        if let Err(ref e) = res {
            let _ = app.emit("git-output-warning", format!("[Git][config] git {} failed: {}", args[0], e));
        } else if let Ok(ref out) = res {
            if !out.status.success() {
                let err_msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
                if !err_msg.is_empty() {
                    let _ = app.emit("git-output-warning", format!("[Git][config] git {} failed: {}", args[0], err_msg));
                }
            }
        }
    }
    res
}

/// Run a git command; on success return stdout text (lossy). On spawn failure
/// with ErrorKind::NotFound, invalidate the cached availability.
async fn run_git(
    git: &str,
    args: &[&str],
    cwd: &str,
    state: &GitState,
    app: Option<&AppHandle>,
) -> Result<String, String> {
    match run_git_raw(git, args, Some(cwd), app).await {
        Ok(out) if out.status.success() => Ok(String::from_utf8_lossy(&out.stdout).to_string()),
        Ok(out) => Err(String::from_utf8_lossy(&out.stderr).trim().to_string()),
        Err(e) => {
            if e.kind() == IoErrorKind::NotFound {
                state.invalidate();
            }
            Err(e.to_string())
        }
    }
}

// ── Tiered detection ──────────────────────────────────────────────────

const WINDOWS_COMMON: &[&str] = &[
    "C:\\Program Files\\Git\\cmd\\git.exe",
    "C:\\Program Files\\Git\\bin\\git.exe",
    "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
    "C:\\Program Files (x86)\\Git\\bin\\git.exe",
];
const MACOS_COMMON: &[&str] = &[
    "/usr/bin/git",
    "/usr/local/bin/git",
    "/opt/homebrew/bin/git",
];
const LINUX_COMMON: &[&str] = &[
    "/usr/bin/git",
    "/usr/local/bin/git",
    "/snap/bin/git",
    "/opt/homebrew/bin/git",
];

fn common_locations() -> Vec<String> {
    let mut out = Vec::new();
    if cfg!(target_os = "windows") {
        out.extend(WINDOWS_COMMON.iter().map(|s| s.to_string()));
        // user-scoped installs (Scoop, Chocolatey, LocalAppData, user profile)
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            out.push(format!("{}\\Programs\\Git\\cmd\\git.exe", local));
            out.push(format!("{}\\Programs\\Git\\bin\\git.exe", local));
        }
        if let Ok(profile) = std::env::var("USERPROFILE") {
            out.push(format!("{}\\scoop\\shims\\git.exe", profile));
        }
        if let Ok(program_data) = std::env::var("ProgramData") {
            out.push(format!("{}\\chocolatey\\bin\\git.exe", program_data));
        }
    } else if cfg!(target_os = "macos") {
        out.extend(MACOS_COMMON.iter().map(|s| s.to_string()));
    } else {
        out.extend(LINUX_COMMON.iter().map(|s| s.to_string()));
    }
    out
}

/// Resolve the full path of `git` via the OS lookup command (`where`/`which`),
/// which uses the process PATH. Returns None if git isn't on PATH.
async fn find_git_in_path() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(out) = Command::new("where").arg("git").output().await {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                for line in text.lines() {
                    let line = line.trim();
                    if !line.is_empty() {
                        return Some(line.to_string());
                    }
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(out) = Command::new("sh").args(["-c", "command -v git"]).output().await {
            if out.status.success() {
                let line = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !line.is_empty() {
                    return Some(line);
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
async fn detect_windows_registry() -> Option<String> {
    for hive in ["HKCU\\Software\\GitForWindows", "HKLM\\SOFTWARE\\GitForWindows"] {
        if let Ok(out) = Command::new("reg").args(["query", hive, "/v", "InstallPath"]).output().await {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                for line in text.lines() {
                    let trimmed = line.trim();
                    if let Some(idx) = trimmed.find("REG_SZ") {
                        let install = trimmed[idx + 6..].trim().trim_matches('"');
                        if !install.is_empty() {
                            let candidate = format!("{}\\cmd\\git.exe", install);
                            if Path::new(&candidate).exists() {
                                return Some(candidate);
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "macos")]
async fn detect_macos_xcode() -> Option<String> {
    if let Ok(out) = Command::new("xcode-select").arg("-p").output().await {
        if out.status.success() {
            let dir = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let candidate = format!("{}/usr/bin/git", dir);
            if Path::new(&candidate).exists() {
                return Some(candidate);
            }
        }
    }
    None
}

async fn git_version(path: &str) -> Option<String> {
    match run_git_raw(path, &["--version"], None, None).await {
        Ok(out) if out.status.success() => {
            Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
        }
        _ => None,
    }
}

/// Run the full tiered detection. `manual` (if Some) is tried FIRST and,
/// when valid, overrides everything else.
pub(crate) async fn detect_git_async(manual: Option<&str>) -> GitAvailability {
    if let Some(mp) = manual {
        if let Some(v) = git_version(mp).await {
            return GitAvailability::available(mp.to_string(), v, "manual");
        }
    }

    // 1. PATH (via where/which)
    if let Some(p) = find_git_in_path().await {
        if let Some(v) = git_version(&p).await {
            return GitAvailability::available(p, v, "path");
        }
    }

    // 2. common per-OS locations
    for loc in common_locations() {
        if let Some(v) = git_version(&loc).await {
            return GitAvailability::available(loc, v, "common");
        }
    }

    // 3. OS-specific: Windows registry / macOS Command Line Tools
    #[cfg(target_os = "windows")]
    if let Some(p) = detect_windows_registry().await {
        if let Some(v) = git_version(&p).await {
            return GitAvailability::available(p, v, "registry");
        }
    }
    #[cfg(target_os = "macos")]
    if let Some(p) = detect_macos_xcode().await {
        if let Some(v) = git_version(&p).await {
            return GitAvailability::available(p, v, "xcode");
        }
    }

    GitAvailability::not_found()
}

/// macOS "fix-path" pattern: sync the app PATH with the interactive
/// shell so GUI-launched apps see the same tools as the terminal. Called once
/// at startup (before any detection).
#[cfg(target_os = "macos")]
pub async fn fix_macos_shell_path() {
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() {
            if let Ok(out) = Command::new(&shell).args(["-l", "-c", "echo $PATH"]).output().await {
                if out.status.success() {
                    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !path.is_empty() {
                        std::env::set_var("PATH", path);
                    }
                }
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub async fn fix_macos_shell_path() {}

// ── Detection commands ──────────────────────────────────────────────────────

/// Return the cached availability. Runs a fresh detection only when the cache
/// is "Unknown" (e.g. right after startup, before the background probe lands).
#[tauri::command]
pub async fn get_git_availability(
    app: AppHandle,
    state: State<'_, GitState>,
) -> Result<GitAvailability, String> {
    let cached = state.availability.lock().unwrap().clone();
    if cached.status != "Unknown" {
        return Ok(cached);
    }

    let manual = state.manual_path.lock().unwrap().clone();
    let detected = detect_git_async(manual.as_deref()).await;
    *state.availability.lock().unwrap() = detected.clone();
    state.persist(&app);
    Ok(detected)
}

/// Force a full re-detection (user clicks "Re-detect Git").
#[tauri::command]
pub async fn re_detect_git(
    app: AppHandle,
    state: State<'_, GitState>,
) -> Result<GitAvailability, String> {
    let manual = state.manual_path.lock().unwrap().clone();
    let detected = detect_git_async(manual.as_deref()).await;
    *state.availability.lock().unwrap() = detected.clone();
    state.persist(&app);
    Ok(detected)
}

/// Set (or clear) the manual git executable path — highest precedence override.
/// Persisted and immediately re-detected.
#[tauri::command]
pub async fn set_git_manual_path(
    app: AppHandle,
    path: Option<String>,
    state: State<'_, GitState>,
) -> Result<GitAvailability, String> {
    let manual = path.map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
    *state.manual_path.lock().unwrap() = manual.clone();
    let detected = detect_git_async(manual.as_deref()).await;
    *state.availability.lock().unwrap() = detected.clone();
    state.persist(&app);
    Ok(detected)
}

/// Backward-compatible alias used by the Source Control panel's initial check.
#[tauri::command]
pub async fn check_git_availability(
    app: AppHandle,
    manual_path: Option<String>,
    state: State<'_, GitState>,
) -> Result<GitAvailability, String> {
    if let Some(mp) = manual_path {
        return set_git_manual_path(app, Some(mp), state).await;
    }
    get_git_availability(app, state).await
}

// ── Repo state + decorations (single porcelain v2 exec) ───────────

fn abs_path(cwd: &str, rel: &str) -> String {
    let rel = rel.trim_end_matches('/');
    if rel.is_empty() {
        return cwd.to_string();
    }
    #[cfg(windows)]
    let rel = rel.replace('/', "\\");
    Path::new(cwd).join(rel).to_string_lossy().into_owned()
}

/// DETECT-007: Check if a path is a symlink whose target is outside the workspace.
/// Returns true if the symlink points outside the working tree (git status should
/// not be shown for such items as they belong to a different repo context).
#[allow(dead_code)]
fn is_symlink_outside_workspace(path: &str, workspace_root: &str) -> bool {
    let p = Path::new(path);
    if !p.is_symlink() {
        return false;
    }
    match std::fs::read_link(p) {
        Ok(target) => {
            let target = if target.is_relative() {
                Path::new(path).parent().unwrap_or(Path::new(path)).join(&target)
            } else {
                target
            };
            match std::fs::canonicalize(&target) {
                Ok(canonical_target) => {
                    match std::fs::canonicalize(workspace_root) {
                        Ok(canonical_ws) => !canonical_target.starts_with(&canonical_ws),
                        Err(_) => true // Can't resolve workspace root = treat as outside
                    }
                }
                Err(_) => true // Can't resolve = treat as outside
            }
        }
        Err(_) => false
    }
}

/// Priority used for folder rollups per DECO-003:
/// Conflict > Deleted > Modified/Renamed > Added/Untracked > Ignored > other.
/// Modified ranks higher than Added because it indicates an existing tracked file
/// was changed — more "urgent" to notice than a brand-new untracked file.
fn code_priority(code: &str) -> u8 {
    match code {
        "Conflict" => 7,
        "D"        => 6,
        "M"        => 5,
        "R"        => 4,
        "A"        => 3,
        "U"        => 2,
        "Ignored"  => 1,
        _          => 0,
    }
}

/// For every changed file, mark every ancestor folder (relative to the
/// workspace root) with the highest-priority decoration present underneath it.
/// Folders keep a single badge (most significant code), matching VS Code exactly.
fn add_folder_rollups(decorations: &mut HashMap<String, GitDecoration>) {
    // Collect all leaf entries (files, not rollup folders) before mutating.
    let leaves: Vec<(String, GitDecoration)> = decorations
        .iter()
        .filter(|(_, v)| !v.is_rollup)
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    let mut rollups: HashMap<String, (u8, GitDecoration)> = HashMap::new();
    for (rel, dec) in leaves {
        let normalized = rel.trim_end_matches('/');
        if normalized.is_empty() {
            continue;
        }
        let mut comps: Vec<&str> = normalized.split('/').collect();
        comps.pop(); // drop the leaf filename itself
        let mut prefix = String::new();
        for comp in comps {
            if comp.is_empty() { continue; }
            if prefix.is_empty() {
                prefix = comp.to_string();
            } else {
                prefix.push('/');
                prefix.push_str(comp);
            }
            let prio = code_priority(&dec.code);
            let keep_existing = rollups
                .get(&prefix)
                .map(|(existing_prio, _)| *existing_prio >= prio)
                .unwrap_or(false);
            if !keep_existing {
                rollups.insert(
                    prefix.clone(),
                    (
                        prio,
                        GitDecoration {
                            code: dec.code.clone(),
                            staged: dec.staged,
                            index_code: None,
                            worktree_code: None,
                            renamed_from: None,
                            is_rollup: true,
                        },
                    ),
                );
            }
        }
    }

    for (folder, (_, dec)) in rollups {
        // A real file/dir leaf entry wins over a computed rollup.
        decorations.entry(folder).or_insert(dec);
    }
}

/// Insert one porcelain entry into the repo state + decoration map. `orig_path`
/// is present only for rename/copy (R/C) records.
#[allow(clippy::too_many_arguments)]
fn add_file_entry(
    repo: &mut RepoState,
    rel_decorations: &mut HashMap<String, GitDecoration>,
    path: &str,
    index_code: char,
    worktree_code: char,
    orig_path: Option<String>,
) {
    let is_rename = index_code == 'R';
    let is_copy = index_code == 'C';
    let code = if is_rename {
        "R".to_string()
    } else if is_copy {
        "C".to_string()
    } else if index_code == 'A' || worktree_code == 'A' {
        "A".to_string()
    } else if index_code == 'D' || worktree_code == 'D' {
        "D".to_string()
    } else if index_code == 'U' || worktree_code == 'U' {
        "U".to_string()
    } else if index_code == 'M' || worktree_code == 'M' {
        "M".to_string()
    } else {
        "M".to_string()
    };

    let staged = index_code != '.' && index_code != ' ';
    let decor = GitDecoration {
        code: code.clone(),
        staged,
        index_code: (index_code != '.' && index_code != ' ').then_some(index_code),
        worktree_code: (worktree_code != '.' && worktree_code != ' ').then_some(worktree_code),
        renamed_from: orig_path.clone(),
        is_rollup: false,
    };
    rel_decorations.insert(path.to_string(), decor);

    let fs = GitFileStatus {
        path: path.to_string(),
        status: code,
        staged,
    };

    if staged {
        repo.staged.push(fs.clone());
    }
    if worktree_code != '.' && worktree_code != ' ' {
        let mut us = fs.clone();
        us.staged = false;
        repo.unstaged.push(us);
    }

    // A rename/copy is ONE record; drop any decoration that may still
    // linger on the old path so the Explorer never shows a ghost badge.
    if let Some(old) = orig_path {
        rel_decorations.remove(old.trim_end_matches('/'));
    }
}

/// Compute the delta against the previous DecorationMap, store the new
/// map, and return the delta to be emitted.
fn compute_delta(state: &GitState, new_map: HashMap<String, GitDecoration>) -> DecorationDelta {
    let mut old = state.decorations.lock().unwrap();
    let mut changed = Vec::new();
    let mut removed = Vec::new();

    for (path, decor) in &new_map {
        match old.get(path) {
            Some(old_decor) if old_decor == decor => {}
            _ => changed.push((path.clone(), decor.clone())),
        }
    }
    for path in old.keys() {
        if !new_map.contains_key(path) {
            removed.push(path.clone());
        }
    }
    *old = new_map;

    DecorationDelta { changed, removed }
}

/// Emit an empty delta so a NotARepo / unavailable state clears every badge.
fn clear_decorations(app: &AppHandle, state: &GitState) {
    let delta = compute_delta(state, HashMap::new());
    let _ = app.emit("git-decorations-changed", delta);
}

#[tauri::command]
pub async fn get_repo_state(
    cwd: String,
    app: AppHandle,
    state: State<'_, GitState>,
) -> Result<RepoState, String> {
    let Some(git) = state.git_command() else {
        clear_decorations(&app, &state);
        return Err("Git is not available".to_string());
    };

    // Cheap gate before any heavy work.
    let inside = match run_git_raw(&git, &["rev-parse", "--is-inside-work-tree"], Some(&cwd), Some(&app)).await {
        Ok(out) => out.status.success() && String::from_utf8_lossy(&out.stdout).trim() == "true",
        Err(e) => {
            if e.kind() == IoErrorKind::NotFound {
                state.invalidate();
            }
            clear_decorations(&app, &state);
            return Err(e.to_string());
        }
    };

    if !inside {
        clear_decorations(&app, &state);
        return Ok(RepoState::not_a_repo());
    }

    // ONE exec for branch + ahead/behind + every file state.
    // -M enables rename detection (porcelain v2 otherwise reports R as A+D).
    let out = match run_git_raw(&git, &["status", "--porcelain=v2", "--branch", "-z", "-M"], Some(&cwd), Some(&app)).await {
        Ok(out) => out,
        Err(e) => {
            if e.kind() == IoErrorKind::NotFound {
                state.invalidate();
            }
            clear_decorations(&app, &state);
            return Err(e.to_string());
        }
    };
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    let entries: Vec<&str> = stdout.split('\0').filter(|s| !s.is_empty()).collect();

    let mut repo = RepoState::fresh();
    
    if let Ok(url_out) = run_git_raw(&git, &["config", "--get", "remote.origin.url"], Some(&cwd), Some(&app)).await {
        if url_out.status.success() {
            let url = String::from_utf8_lossy(&url_out.stdout).trim().to_string();
            if !url.is_empty() {
                repo.remote_url = Some(url);
            }
        }
    }

    let mut rel_decorations: HashMap<String, GitDecoration> = HashMap::new();

    let mut i = 0;
    while i < entries.len() {
        let entry = entries[i];

        if entry.starts_with("# branch.head ") {
            let head = entry[14..].trim().to_string();
            repo.branch = Some(if head.is_empty() { "(detached)".to_string() } else { head });
        } else if entry.starts_with("# branch.upstream ") {
            let upstream = entry[18..].trim().to_string();
            repo.has_upstream = !upstream.is_empty();
            repo.upstream = if upstream.is_empty() { None } else { Some(upstream.clone()) };
            // remote name is the first path segment, e.g. "origin" in "origin/main"
            repo.upstream_remote = upstream.split('/').next().filter(|s| !s.is_empty()).map(|s| s.to_string());
        } else if entry.starts_with("# branch.oid ") {
            let oid = entry[13..].trim().to_string();
            // Unborn branch (repo initialized, no commit yet) prints "(initial)".
            if oid.is_empty() || oid == "(initial)" {
                repo.head_short = None;
                repo.unborn = true;
            } else {
                repo.head_short = Some(oid.chars().take(8).collect());
            }
        } else if entry.starts_with("# branch.ab ") {
            let ab = &entry[12..];
            let mut parts = ab.split('-');
            if let Some(plus) = parts.next() {
                repo.ahead = plus.trim_start_matches('+').trim().parse().unwrap_or(0);
            }
            if let Some(minus) = parts.next() {
                repo.behind = minus.trim().trim_start_matches('-').parse().unwrap_or(0);
            }
        } else if entry.starts_with("1 ") {
            let parts: Vec<&str> = entry.split(' ').collect();
            if parts.len() >= 9 {
                let xy = parts[1];
                let index_code = xy.chars().nth(0).unwrap_or(' ');
                let worktree_code = xy.chars().nth(1).unwrap_or(' ');
                let path = parts[8..].join(" ");
                add_file_entry(&mut repo, &mut rel_decorations, &path, index_code, worktree_code, None);
            }
        } else if entry.starts_with("2 ") {
            let parts: Vec<&str> = entry.split(' ').collect();
            if parts.len() >= 10 {
                let xy = parts[1];
                let index_code = xy.chars().nth(0).unwrap_or(' ');
                let worktree_code = xy.chars().nth(1).unwrap_or(' ');
                let path = parts[9..].join(" ");
                let mut orig_path = None;
                if i + 1 < entries.len() {
                    orig_path = Some(entries[i + 1].to_string());
                    i += 1; // -z puts origPath in its own NUL record
                }
                add_file_entry(&mut repo, &mut rel_decorations, &path, index_code, worktree_code, orig_path);
            }
        } else if entry.starts_with("u ") {
            // unmerged / conflicted: `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`
            let parts: Vec<&str> = entry.split(' ').collect();
            if parts.len() >= 11 {
                let path = parts[10..].join(" ");
                repo.conflicted.push(GitFileStatus {
                    path: path.clone(),
                    status: "Conflict".to_string(),
                    staged: false,
                });
                rel_decorations.insert(
                    path,
                    GitDecoration {
                        code: "Conflict".to_string(),
                        staged: false,
                        index_code: None,
                        worktree_code: None,
                        renamed_from: None,
                        is_rollup: false,
                    },
                );
            }
        } else if entry.starts_with("? ") {
            // untracked (a whole untracked directory collapses to `? foo/`)
            let path = entry[2..].trim_end_matches('/').to_string();
            if path.is_empty() {
                i += 1;
                continue;
            }
            repo.untracked.push(GitFileStatus {
                path: path.clone(),
                status: "U".to_string(),
                staged: false,
            });
            rel_decorations.insert(
                path,
                GitDecoration {
                    code: "U".to_string(),
                    staged: false,
                    index_code: None,
                    worktree_code: None,
                    renamed_from: None,
                    is_rollup: false,
                },
            );
        }

        i += 1;
    }

    // Unborn branch: no HEAD commit at all (freshly initialized repo).
    if repo.head_short.is_none() {
        repo.unborn = true;
    }

    // Merge / rebase / cherry-pick in progress — VSCode parity: these gate the
    // commit action and decorate the branch label. The .git dir may live in a
    // submodule / worktree, so resolve it via git instead of assuming `cwd/.git`.
    if let Ok(dir_out) = run_git_raw(&git, &["rev-parse", "--absolute-git-dir"], Some(&cwd), Some(&app)).await {
        if dir_out.status.success() {
            let git_dir = String::from_utf8_lossy(&dir_out.stdout).trim().trim_end_matches(['/', '\\']).to_string();
            if !git_dir.is_empty() {
                let d = Path::new(&git_dir);
                repo.merge_in_progress = d.join("MERGE_HEAD").exists();
                repo.rebase_in_progress = d.join("rebase-merge").exists() || d.join("rebase-apply").exists();
                repo.cherry_pick_in_progress = d.join("CHERRY_PICK_HEAD").exists();
            }
        }
    }

    // Configured remotes (drives the Publish flow when none exists).
    if let Ok(rem_out) = run_git(&git, &["remote"], &cwd, &state, Some(&app)).await {
        repo.remotes = rem_out.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect();
    }

    // Folder rollups computed in Rust (cheap, data already in memory).
    add_folder_rollups(&mut rel_decorations);

    // Convert to absolute-path keys so the Explorer tree / tabs can join on
    // `node.path` directly (decorations are independent of tree structure).
    let abs_map: HashMap<String, GitDecoration> = rel_decorations
        .into_iter()
        .map(|(rel, dec)| (abs_path(&cwd, &rel), dec))
        .collect();

    // Emit DELTA only (changed/removed), never the whole map.
    let delta = compute_delta(&state, abs_map);
    let _ = app.emit("git-decorations-changed", delta);

    Ok(repo)
}

// ── Operations (async, cancellable, streamed progress) ────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GitProgress {
    pub phase: String,
    pub percent: Option<u32>,
    pub message: String,
    pub done: bool,
}

const NETWORK_TIMEOUT: Duration = Duration::from_secs(600);

fn parse_progress(line: &str) -> Option<u32> {
    static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| regex::Regex::new(r"(\d+)\s*%").unwrap());
    re.captures(line).and_then(|c| c.get(1)).and_then(|m| m.as_str().parse().ok())
}

/// Run a git operation. When a progress channel is supplied, git's real
/// stderr progress (e.g. "Receiving objects:  42%") is parsed and streamed to
/// the frontend. The child pid is registered so `git_cancel_op` can kill
/// the actual process, and a timeout guards network operations.
#[allow(clippy::too_many_arguments)]
async fn run_streaming(
    git: &str,
    args: &[&str],
    cwd: &str,
    phase: &str,
    op_id: &str,
    channel: &tauri::ipc::Channel<GitProgress>,
    state: &GitState,
) -> Result<(), String> {
    let mut cmd = Command::new(git);
    if let Ok(path_env) = std::env::var("PATH") {
        cmd.env("PATH", path_env);
    }
    cmd.args(args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        if e.kind() == IoErrorKind::NotFound {
            state.invalidate();
        }
        e.to_string()
    })?;

    let pid = child.id().unwrap_or(0);
    state.ops.lock().unwrap().insert(op_id.to_string(), pid);

    let chan = channel.clone();
    let phase_owned = phase.to_string();

    let stderr = child.stderr.take();
    let stderr_task = tokio::spawn(async move {
        let mut lines: Vec<String> = Vec::new();
        if let Some(stderr) = stderr {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if let Some(pct) = parse_progress(&line) {
                    let _ = chan.send(GitProgress {
                        phase: phase_owned.clone(),
                        percent: Some(pct),
                        message: line.clone(),
                        done: false,
                    });
                }
                lines.push(line);
            }
        }
        lines
    });

    let stdout = child.stdout.take();
    let stdout_task = tokio::spawn(async move {
        let mut text = String::new();
        if let Some(stdout) = stdout {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                text.push_str(&line);
                text.push('\n');
            }
        }
        text
    });

    let waited = tokio::time::timeout(NETWORK_TIMEOUT, child.wait()).await;
    let result = match waited {
        Ok(Ok(status)) => {
            let stderr_lines = stderr_task.await.unwrap_or_default();
            let _stdout_text = stdout_task.await.unwrap_or_default();
            let _ = channel.send(GitProgress {
                phase: phase.to_string(),
                percent: Some(100),
                message: "done".to_string(),
                done: true,
            });
            if status.success() {
                Ok(())
            } else {
                Err(stderr_lines.join("\n"))
            }
        }
        Ok(Err(e)) => {
            stderr_task.abort();
            stdout_task.abort();
            Err(format!("Failed to run git {}: {}", phase, e))
        }
        Err(_) => {
            let _ = child.kill().await;
            stderr_task.abort();
            stdout_task.abort();
            Err(format!("{} timed out", phase))
        }
    };

    state.ops.lock().unwrap().remove(op_id);
    result
}

/// Cancel a running operation by really killing the child process tree.
#[tauri::command]
pub async fn git_cancel_op(op_id: String, state: State<'_, GitState>) -> Result<(), String> {
    let pid = state.ops.lock().unwrap().remove(&op_id);
    if let Some(pid) = pid {
        #[cfg(target_os = "windows")]
        {
            tokio::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .status()
                .await
                .map_err(|e| e.to_string())?;
        }
        #[cfg(not(target_os = "windows"))]
        {
            tokio::process::Command::new("kill")
                .arg("-9")
                .arg(pid.to_string())
                .status()
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
// ---- Basic operations ----

#[tauri::command]
pub async fn git_init(app: AppHandle, cwd: String, state: State<'_, GitState>) -> Result<(), String> {
    let git = state.git_command().ok_or("Git is not available")?;
    // VSCode parity: initialize on the user's `init.defaultBranch`, falling
    // back to "main". Uses `git init -b` when supported, otherwise a plain
    // init followed by a HEAD symref move (unborn branch).
    let default_branch = match run_git(&git, &["config", "--get", "init.defaultBranch"], &cwd, &state, Some(&app)).await {
        Ok(out) => out.trim().to_string(),
        Err(_) => String::new(),
    };
    let default_branch = if default_branch.is_empty() { "main".to_string() } else { default_branch };

    match run_git(&git, &["init", "-b", &default_branch], &cwd, &state, Some(&app)).await {
        Ok(_) => Ok(()),
        // git < 2.28 has no `init -b`: init plainly, then point HEAD at the
        // default branch (safe because the repo is freshly created/unborn).
        Err(_) => {
            run_git(&git, &["init"], &cwd, &state, Some(&app)).await?;
            run_git(&git, &["symbolic-ref", "HEAD", &format!("refs/heads/{}", default_branch)], &cwd, &state, Some(&app)).await?;
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn git_stage(app: AppHandle, cwd: String, path: String, state: State<'_, GitState>) -> Result<(), String> {
    // DETECT-008: Acquire write lock to serialize stage/unstage/commit operations
    let _lock = state.write_op_lock.lock().await;
    let git = state.git_command().ok_or("Git is not available")?;
    let path = if path.trim() == "." { ".".to_string() } else { path };
    run_git(&git, &["add", "--", &path], &cwd, &state, Some(&app)).await.map(|_| ())
}

#[tauri::command]
pub async fn git_unstage(app: AppHandle, cwd: String, path: String, state: State<'_, GitState>) -> Result<(), String> {
    // DETECT-008: Acquire write lock to serialize stage/unstage/commit operations
    let _lock = state.write_op_lock.lock().await;
    let git = state.git_command().ok_or("Git is not available")?;
    let path = if path.trim() == "." { ".".to_string() } else { path };
    run_git(&git, &["restore", "--staged", "--", &path], &cwd, &state, Some(&app)).await.map(|_| ())
}

#[tauri::command]
pub async fn git_commit(app: AppHandle, cwd: String, message: String, state: State<'_, GitState>) -> Result<(), String> {
    // DETECT-008: Acquire write lock to serialize stage/unstage/commit operations
    let _lock = state.write_op_lock.lock().await;
    let git = state.git_command().ok_or("Git is not available")?;
    if message.trim().is_empty() {
        return Err("Commit message is empty".to_string());
    }
    run_git(&git, &["commit", "-m", &message], &cwd, &state, Some(&app)).await.map(|_| ())
}

/// Discard all local changes (staged + unstaged) for a path back to HEAD.
#[tauri::command]
pub async fn git_discard(app: AppHandle, cwd: String, path: String, state: State<'_, GitState>) -> Result<(), String> {
    let git = state.git_command().ok_or("Git is not available")?;
    run_git(&git, &["restore", "--source=HEAD", "--staged", "--worktree", "--", &path], &cwd, &state, Some(&app))
        .await
        .map(|_| ())
}

// ── Network operations (progress + cancel + timeout) ────────────────────────

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn git_push(
    cwd: String,
    op_id: Option<String>,
    progress: tauri::ipc::Channel<GitProgress>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    let git = state.git_command().ok_or("Git is not available")?;
    let op_id = op_id.unwrap_or_else(|| format!("push-{}", now_ms()));
    run_streaming(&git, &["push", "--progress"], &cwd, "push", &op_id, &progress, &state).await
}

/// VSCode "Publish Branch": publish the current branch to a remote and set it
/// as upstream — `git push -u <remote> HEAD`. Picks "origin" when present,
/// otherwise the first configured remote.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn git_publish(
    cwd: String,
    op_id: Option<String>,
    progress: tauri::ipc::Channel<GitProgress>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    let git = state.git_command().ok_or("Git is not available")?;
    let remotes = run_git(&git, &["remote"], &cwd, &state, None).await.unwrap_or_default();
    let names: Vec<String> = remotes.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect();
    // VSCode prioritizes "origin" and falls back to the first configured remote.
    let remote = names.iter().find(|r| *r == "origin").or_else(|| names.first());
    let Some(remote) = remote else {
        return Err("Your repository has no remotes configured to publish to.".to_string());
    };
    let op_id = op_id.unwrap_or_else(|| format!("publish-{}", now_ms()));
    run_streaming(&git, &["push", "--progress", "-u", remote, "HEAD"], &cwd, "publish", &op_id, &progress, &state).await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn git_pull(
    cwd: String,
    op_id: Option<String>,
    progress: tauri::ipc::Channel<GitProgress>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    let git = state.git_command().ok_or("Git is not available")?;
    let op_id = op_id.unwrap_or_else(|| format!("pull-{}", now_ms()));
    run_streaming(&git, &["pull", "--progress"], &cwd, "pull", &op_id, &progress, &state).await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn git_fetch(
    cwd: String,
    op_id: Option<String>,
    progress: tauri::ipc::Channel<GitProgress>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    let git = state.git_command().ok_or("Git is not available")?;
    let op_id = op_id.unwrap_or_else(|| format!("fetch-{}", now_ms()));
    run_streaming(&git, &["fetch", "--all", "--prune", "--progress"], &cwd, "fetch", &op_id, &progress, &state).await
}

/// Clone a repository into `dest`. `git clone` creates the destination folder,
/// so the child process runs with the PARENT of `dest` as its working directory.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn git_clone(
    url: String,
    dest: String,
    op_id: Option<String>,
    progress: tauri::ipc::Channel<GitProgress>,
    state: State<'_, GitState>,
) -> Result<(), String> {
    let git = state.git_command().ok_or("Git is not available")?;
    if url.trim().is_empty() || dest.trim().is_empty() {
        return Err("URL and destination are required".to_string());
    }
    let parent = Path::new(&dest)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| dest.clone());
    let op_id = op_id.unwrap_or_else(|| format!("clone-{}", now_ms()));
    run_streaming(&git, &["clone", "--progress", &url, &dest], &parent, "clone", &op_id, &progress, &state).await
}

// ── History: lazy & paged ──────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GitLogEntry {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub refs: String,
    /// Parent hashes (space-separated from `%P`). Empty for the root commit.
    pub parents: String,
    pub stats: String,
}

/// `git show <rev>:<path>` needs a path RELATIVE to the repo root, but callers
/// (ImageViewer, ImageDiff) pass the absolute disk path. Strip the cwd prefix so
/// revision lookups work with either form.
fn repo_relative_path(cwd: &str, path: &str) -> String {
    let p = path.replace('\\', "/");
    let cwd_norm = cwd.replace('\\', "/");
    let base = cwd_norm.trim_end_matches('/');
    match p.strip_prefix(&format!("{}/", base)) {
        Some(rel) => rel.to_string(),
        None => p,
    }
}

#[tauri::command]
pub async fn git_file_diff(app: AppHandle, cwd: String, path: String, state: State<'_, GitState>) -> Result<String, String> {
    let git = state.git_command().ok_or("Git is not available")?;
    let rel_path = repo_relative_path(&cwd, &path);
    // Show diff against HEAD to include both staged and unstaged changes for the gutter
    run_git(&git, &["diff", "-U0", "HEAD", "--", &rel_path], &cwd, &state, Some(&app)).await
}

#[tauri::command]
pub async fn get_git_file_content(app: AppHandle, cwd: String, path: String, revision: String, state: State<'_, GitState>) -> Result<String, String> {
    let git = state.git_command().ok_or("Git is not available")?;
    let rel_path = repo_relative_path(&cwd, &path);
    let target = format!("{}:{}", revision, rel_path);
    let content = run_git(&git, &["show", &target], &cwd, &state, Some(&app)).await?;
    // Normalize CRLF to LF to match read_file_text (file_ops.rs) behavior,
    // preventing git gutter baseline mismatch on Windows (CRLF on disk).
    Ok(content.replace("\r\n", "\n"))
}

#[tauri::command]
pub async fn get_git_file_binary(app: AppHandle, cwd: String, path: String, revision: String, state: State<'_, GitState>) -> Result<Vec<u8>, String> {
    let git = state.git_command().ok_or("Git is not available")?;
    let rel_path = repo_relative_path(&cwd, &path);
    let target = format!("{}:{}", revision, rel_path);
    match run_git_raw(&git, &["show", &target], Some(&cwd), Some(&app)).await {
        Ok(out) if out.status.success() => Ok(out.stdout),
        Ok(out) => Err(String::from_utf8_lossy(&out.stderr).trim().to_string()),
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                state.invalidate();
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn get_commit_files(app: AppHandle, cwd: String, hash: String, state: State<'_, GitState>) -> Result<Vec<GitFileStatus>, String> {
    let git = state.git_command().ok_or("Git is not available")?;
    
    let stdout = run_git(&git, &["show", "--name-status", "--pretty=format:", &hash], &cwd, &state, Some(&app)).await?;

    let mut files = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let status = match parts[0].chars().next().unwrap_or('M') {
                'M' => "M",
                'A' => "A",
                'D' => "D",
                'R' => "R",
                'C' => "C",
                'U' => "U",
                _ => "M"
            };
            
            let path = parts[1..].join(" ");
            
            files.push(GitFileStatus {
                path,
                status: status.to_string(),
                staged: false,
            });
        }
    }
    
    Ok(files)
}

#[tauri::command]
pub async fn git_log(app: AppHandle, cwd: String, limit: Option<u32>, offset: Option<u32>, state: State<'_, GitState>) -> Result<Vec<GitLogEntry>, String> {
    let git = state.git_command().ok_or("Git is not available")?;
    let limit_str = limit.unwrap_or(50).to_string();
    let mut args: Vec<&str> = vec!["log", "--shortstat", "--pretty=format:<C>%h%x00%s%x00%an%x00%ae%x00%at%x00%D%x00%P", "-n", &limit_str];
    let skip_str;
    if let Some(skip) = offset.filter(|s| *s > 0) {
        skip_str = skip.to_string();
        args.push("--skip");
        args.push(&skip_str);
    }
    let stdout = run_git(&git, &args, &cwd, &state, Some(&app)).await?;

    let mut entries = Vec::new();
    let blocks: Vec<&str> = stdout.split("<C>").collect();
    
    for block in blocks {
        let block = block.trim();
        if block.is_empty() { continue; }
        
        let mut lines = block.lines();
        let header = lines.next().unwrap_or("");
        let stats_line = lines.next().unwrap_or("").trim();
        
        let parts: Vec<&str> = header.split('\0').collect();
        if parts.len() >= 6 {
            entries.push(GitLogEntry {
                hash: parts[0].to_string(),
                message: parts[1].to_string(),
                author: parts[2].to_string(),
                email: parts[3].to_string(),
                date: parts[4].to_string(),
                refs: parts.get(5).unwrap_or(&"").to_string(),
                parents: parts.get(6).unwrap_or(&"").to_string(),
                stats: stats_line.to_string(),
            });
        }
    }
    Ok(entries)
}
