//! Ignore Rules
//! 
//! Layered ignore logic for explorer, search, and file watching.

use std::path::Path;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::OnceLock;

/// Shared Path/Ignore Rules.
///
/// Single source of truth for what counts as "ignored" across all consumers,
/// split into **3 independent layers** instead of one merged list:
///
///   1. `EXPLORER_HARD_EXCLUDE`  — Layer 1. Disappears entirely from the
///      Explorer tree. Minimal on purpose (VCS/OS artifacts), and deliberately
///      NOT customizable.
///   2. `SEARCH_SCAN_EXCLUDE`    — Layer 2. Stays visible in Explorer (can be
///      expanded manually) but is excluded from Global Search, Quick Open and
///      whole-project scans. Customizable via Settings.
///   3. `WATCHER_EXCLUDE`        — Layer 3. Never recursively watched by the
///      file watcher (pure I/O performance, invisible to the user). Always a
///      superset of `SEARCH_SCAN_EXCLUDE`.
///
/// Priority when deciding whether a path is excluded:
///   1. `.notronignore` at the workspace root (and nested copies) — applied via
///      `WalkBuilder::add_custom_ignore_filename` (highest precedence among
///      ignore files, so `!pattern` negations can re-include defaults),
///   2. `.gitignore` (incl. nested) — `WalkBuilder::git_ignore`,
///   3. user Settings (search exclude / include),
///   4. the app defaults below.
///
/// Steps 3 & 4 are rendered into a single app-level ignore file applied with
/// `WalkBuilder::add_ignore`, which has **lower precedence than every other
/// source** of ignore rules — so `.notronignore`/`.gitignore` negations always
/// win over the built-in defaults, exactly like git semantics.

// ── Layer 1 — Explorer Hard Exclude ─────────────────────────────────────────
// Items here never appear in the Explorer tree. Do not put large build folders like node_modules
// /dist/build here — that is Layer 2's job.
pub const EXPLORER_HARD_EXCLUDE: &[&str] = &[
    ".git",
    ".svn",
    ".hg",
    "CVS",
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
];

// ── Layer 2 — Search & Scan Exclude ─────────────────────────────────────────
// Items here STAY VISIBLE in Explorer (expandable manually), but are excluded
// from Global Search, Quick Open, and whole-project scans. Customizable by the
// user through Settings (additions in `search_exclude`, removals in
// `search_include`).
pub const SEARCH_SCAN_EXCLUDE: &[&str] = &[
    // JavaScript / TypeScript / Node ecosystem
    "node_modules",
    "bower_components",
    ".pnpm-store",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".output",
    ".vercel",
    ".netlify",
    ".turbo",
    ".parcel-cache",
    ".cache",
    "coverage",
    ".nyc_output",
    ".yarn/cache",
    ".yarn/unplugged",
    // Python ecosystem
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".tox",
    ".nox",
    ".venv",
    "venv",
    "env",
    "*.egg-info",
    ".eggs",
    "site-packages",
    // Rust
    "target",
    // General / cross-language
    "vendor",
    ".terraform",
    ".idea",
    ".vs",
];

// ── Layer 3 — Watcher/Scan Exclude ──────────────────────────────────────────
// Folders here are NEVER recursively watched by the Notron file watcher,
// regardless of Explorer/Search state. Pure I/O performance decision, not a
// user-visible setting. Superset of `SEARCH_SCAN_EXCLUDE` plus patterns that
// are specifically expensive to watch.
pub const WATCHER_EXCLUDE: &[&str] = &[
    // -- all of SEARCH_SCAN_EXCLUDE --
    "node_modules",
    "bower_components",
    ".pnpm-store",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".output",
    ".vercel",
    ".netlify",
    ".turbo",
    ".parcel-cache",
    ".cache",
    "coverage",
    ".nyc_output",
    ".yarn/cache",
    ".yarn/unplugged",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".tox",
    ".nox",
    ".venv",
    "venv",
    "env",
    "*.egg-info",
    ".eggs",
    "site-packages",
    "target",
    "vendor",
    ".terraform",
    ".idea",
    ".vs",
    // -- extra watcher-only excludes --
    // .git: never watch recursively; Source Control (git) watches only key
    // files (HEAD/index/refs) instead. Also VCS internals are irrelevant here.
    ".git",
    ".log",
    "*.lock",
];

// ── Fast single-path checks (watcher, symbol index, sync listing) ──────────

/// Layer 1 check by name — used by the Explorer scan (always active).
pub fn is_explorer_hard_excluded(name: &str) -> bool {
    EXPLORER_HARD_EXCLUDE.iter().any(|d| *d == name)
}

/// Build a `GlobSet` where each pattern matches at any directory depth
/// (gitignore-style), used for O(1)-ish single-path denylist checks.
fn globset_from(patterns: &[&str]) -> globset::GlobSet {
    let mut builder = globset::GlobSetBuilder::new();
    for p in patterns {
        let anchored = if p.contains('/') || p.starts_with("**") {
            p.to_string()
        } else {
            format!("**/{}", p)
        };
        if let Ok(g) = globset::Glob::new(&anchored) {
            builder.add(g);
        }
    }
    builder.build().unwrap_or_default()
}

fn search_globset() -> &'static globset::GlobSet {
    static SET: OnceLock<globset::GlobSet> = OnceLock::new();
    SET.get_or_init(|| globset_from(SEARCH_SCAN_EXCLUDE))
}

fn watcher_globset() -> &'static globset::GlobSet {
    static SET: OnceLock<globset::GlobSet> = OnceLock::new();
    SET.get_or_init(|| globset_from(WATCHER_EXCLUDE))
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// Layer 2 fast check for a single path (no ignore-file reading). Used by the
/// symbol index and other per-path scans; workspace-wide scans should use the
/// walker factory below so user settings and ignore files also apply.
pub fn is_search_excluded_path(path: &Path) -> bool {
    search_globset().is_match(normalize_path(path).as_str())
}

/// Layer 3 fast check for a single path — used by the file watcher.
pub fn is_watcher_excluded_path(path: &Path) -> bool {
    watcher_globset().is_match(normalize_path(path).as_str())
}

// ── App-level ignore file (defaults + user Settings) ────────────────────────

/// Render the effective "defaults + user settings" rules into gitignore-style
/// lines. Order matters (last match wins within the file):
///   1. app defaults (SEARCH_SCAN_EXCLUDE),
///   2. user additions (`search_exclude`),
///   3. user removals (`search_include`, negated with `!`).
pub fn effective_ignore_lines(user_exclude: &[String], user_include: &[String]) -> Vec<String> {
    let mut lines: Vec<String> = SEARCH_SCAN_EXCLUDE
        .iter()
        .map(|s| s.to_string())
        .collect();
    lines.extend(user_exclude.iter().cloned());
    for inc in user_include {
        if !inc.trim().is_empty() {
            lines.push(format!("!{}", inc));
        }
    }
    lines
}

/// Cache for the rendered app ignore file: (content key, path). Content only
/// changes when Settings change, so a matching key skips the rewrite entirely.
static APP_IGNORE_CACHE: OnceLock<Mutex<Option<(String, PathBuf)>>> = OnceLock::new();

fn write_app_ignore_file(lines: &[String]) -> Result<PathBuf, String> {
    let key = lines.join("\n");
    let cache = APP_IGNORE_CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = cache.lock().unwrap();
    if let Some((k, p)) = &*guard {
        if k == &key && p.exists() {
            return Ok(p.clone());
        }
    }

    let path = std::env::temp_dir().join("notron-app-ignore.ignore");
    std::fs::write(&path, key.as_bytes()).map_err(|e| e.to_string())?;
    *guard = Some((key, path.clone()));
    Ok(path)
}

/// Shared walker factory for workspace-wide scans (Search, Quick Open, symbol
/// indexing). Applies `.notronignore` (highest), `.gitignore`/`.git/info/exclude`
/// (middle) and, at the LOWEST precedence, an app-level ignore file rendered
/// from `app_lines` (defaults + user Settings). Skipping hidden files is
/// controlled by `skip_hidden`.
pub fn workspace_walker(root: &Path, skip_hidden: bool, app_lines: &[String]) -> ignore::WalkBuilder {
    let mut builder = ignore::WalkBuilder::new(root);
    builder
        .hidden(skip_hidden)
        .parents(true)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(true)
        .add_custom_ignore_filename(".notronignore");

    if !app_lines.is_empty() {
        match write_app_ignore_file(app_lines) {
            Ok(path) => {
                let _ = builder.add_ignore(path);
            }
            Err(e) => eprintln!("ignore_rules: failed to write app ignore file: {}", e),
        }
    }

    builder
}

/// Walker used by the Explorer tree scans. Unlike `workspace_walker`, this one
/// does NOT apply `.gitignore` or the app defaults, because search-only
/// excludes (Layer 2) must stay visible in the Explorer. Only the workspace
/// `.notronignore` and hidden-file handling hide entries here.
#[allow(dead_code)]
pub fn explorer_walker(root: &Path, skip_hidden: bool) -> ignore::WalkBuilder {
    let mut builder = ignore::WalkBuilder::new(root);
    builder
        .hidden(skip_hidden)
        .parents(true)
        .git_ignore(false)
        .git_exclude(false)
        .git_global(false)
        .add_custom_ignore_filename(".notronignore");
    builder
}
