//! Search
//!
//! Global search and safe replace-all backed by the grep crate.

use std::collections::HashMap;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;

use chardetng::EncodingDetector;
use encoding_rs::{Encoding, UTF_8};
use grep::matcher::{LineTerminator, Matcher};
use grep::regex::{RegexMatcher, RegexMatcherBuilder};
use grep::searcher::{BinaryDetection, Searcher, SearcherBuilder, Sink, SinkContext, SinkMatch};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::file_ops::SearchRegistry;
use crate::ignore_rules;
use crate::stream::StreamedBatch;

// ── IPC Types ───────────────────────────────────────────────────────────────

/// A single match (or context line) inside a file. `start`/`end` are byte
/// offsets relative to `text` (the trimmed line preview).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchLineMatch {
    pub line: u64,
    pub start: usize,
    pub end: usize,
    pub text: String,
    #[serde(default)]
    pub is_context: bool,
}

/// Aggregated matches for one file — streamed as a single `StreamedBatch` item.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchFileItem {
    pub path: String,
    pub display_path: String,
    pub file_name: String,
    pub match_count: usize,
    pub matches: Vec<SearchLineMatch>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub query: String,
    pub case_sensitive: bool,
    pub use_regex: bool,
    pub whole_word: bool,
    pub dot_files: bool,
    pub context_lines: usize,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceOptions {
    pub query: String,
    pub replace: String,
    pub case_sensitive: bool,
    pub use_regex: bool,
    pub whole_word: bool,
}

/// One per-file outcome of a Replace All commit.
#[derive(Serialize, Clone, Debug)]
pub struct ReplaceProgress {
    pub path: String,
    pub status: String,   // "replaced" | "skipped" | "error"
    pub replaced: usize,  // occurrences replaced (0 for skip/error)
    pub message: String,
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn trim_crlf(mut b: &[u8]) -> &[u8] {
    while let Some(&last) = b.last() {
        if last == b'\n' || last == b'\r' {
            b = &b[..b.len() - 1];
        } else {
            break;
        }
    }
    b
}

fn build_matcher(opts: &SearchOptions) -> Result<RegexMatcher, String> {
    let mut b = RegexMatcherBuilder::new();
    b.case_insensitive(!opts.case_sensitive)
        .line_terminator(Some(b'\n'))
        .unicode(true);
    if opts.whole_word {
        b.word(true);
    }
    if !opts.use_regex {
        b.fixed_strings(true);
    }
    b.build(&opts.query).map_err(|e| e.to_string())
}

// ── Sink ────────────────────────────────────────────────────────────────────

const MAX_MATCHES_PER_FILE: usize = 2000;

/// Collects matches (and optional context lines) for a single file. Context
/// handling works as follows:
///   * `context()` fires once per context line; lines arriving before the next
///     match are buffered as "before" context and flushed ahead of the match,
///   * lines arriving right after a match are "after" context and appended
///     directly,
///   * `context_break()` marks a gap between non-contiguous groups.
struct SearchSink<'m> {
    matcher: &'m RegexMatcher,
    matches: Vec<SearchLineMatch>,
    pending_before: Vec<SearchLineMatch>,
    in_after_context: bool,
    truncated: bool,
}

impl Sink for SearchSink<'_> {
    type Error = io::Error;

    fn matched(&mut self, _searcher: &Searcher, mat: &SinkMatch) -> Result<bool, Self::Error> {
        let line_no = mat.line_number().unwrap_or(0);
        self.in_after_context = false;

        if !self.pending_before.is_empty() {
            let remaining = MAX_MATCHES_PER_FILE.saturating_sub(self.matches.len());
            if self.pending_before.len() <= remaining {
                self.matches.append(&mut self.pending_before);
            } else {
                self.truncated = true;
                self.pending_before.clear();
            }
        }

        for line in mat.lines() {
            let trimmed = trim_crlf(line);
            let text = String::from_utf8_lossy(trimmed).into_owned();
            let mut ranges: Vec<(usize, usize)> = Vec::new();
            let _ = self.matcher.find_iter(trimmed, |m| {
                ranges.push((m.start(), m.end()));
                true
            });
            for (start, end) in ranges {
                if self.matches.len() >= MAX_MATCHES_PER_FILE {
                    self.truncated = true;
                    return Ok(false);
                }
                self.matches.push(SearchLineMatch {
                    line: line_no,
                    start,
                    end,
                    text: text.clone(),
                    is_context: false,
                });
            }
        }
        self.in_after_context = true;
        Ok(true)
    }

    fn context(&mut self, _searcher: &Searcher, ctx: &SinkContext) -> Result<bool, Self::Error> {
        let item = SearchLineMatch {
            line: ctx.line_number().unwrap_or(0),
            start: 0,
            end: 0,
            text: String::from_utf8_lossy(trim_crlf(ctx.bytes())).into_owned(),
            is_context: true,
        };
        if self.in_after_context {
            if self.matches.len() < MAX_MATCHES_PER_FILE {
                self.matches.push(item);
            } else {
                self.truncated = true;
            }
        } else if self.pending_before.len() < MAX_MATCHES_PER_FILE {
            self.pending_before.push(item);
        }
        Ok(true)
    }

    fn context_break(&mut self, _searcher: &Searcher) -> Result<bool, Self::Error> {
        self.in_after_context = false;
        self.pending_before.clear();
        Ok(true)
    }

    fn binary_data(&mut self, _searcher: &Searcher, _offset: u64) -> Result<bool, Self::Error> {
        // Quit the file immediately: binary files are skipped entirely.
        Ok(false)
    }
}

// ── Global Search (streaming, cancellable) ──────────────────────────────────

/// Search a workspace with the ripgrep engine. Each matching file is streamed
/// over `channel` as one `SearchFileItem`; batches coalesce ~20 files / 100 ms.
/// A new search with a different `cancel_token` supersedes (and cancels) the
/// previous one via `file_ops::cancel_search`.
#[tauri::command]
pub async fn search_files_stream(
    options: SearchOptions,
    workspace_path: String,
    max_results: Option<usize>,
    max_file_size: Option<u64>,
    cancel_token: String,
    channel: tauri::ipc::Channel<StreamedBatch<SearchFileItem>>,
    registry: State<'_, SearchRegistry>,
    db: State<'_, crate::db::DbState>,
) -> Result<(), String> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    registry
        .active_searches
        .lock()
        .await
        .insert(cancel_token.clone(), cancel_flag.clone());

    let matcher = build_matcher(&options)?;
    let max_results = max_results.unwrap_or(10_000);
    let max_file_size = max_file_size.unwrap_or(5 * 1024 * 1024);
    let registry_clone = registry.inner().active_searches.clone();

    // Layer 2: render user settings (search.exclude / search.include)
    // into the app ignore file lines that the walker applies at lowest precedence.
    let user_ignore = crate::db::get_ignore_settings(db.inner(), &workspace_path).await?;
    let app_ignore_lines = ignore_rules::effective_ignore_lines(
        &user_ignore.search_exclude,
        &user_ignore.search_include,
    );

    tokio::task::spawn_blocking(move || {
        let (tx, rx) = mpsc::channel::<SearchFileItem>();
        let matches_total = Arc::new(AtomicUsize::new(0));
        let files_scanned = Arc::new(AtomicUsize::new(0));
        let cancel_flag_thread = cancel_flag.clone();
        let matches_total_thread = matches_total.clone();
        let files_scanned_thread = files_scanned.clone();

        let send_thread = thread::spawn(move || {
            let mut batch = Vec::new();
            let mut last_send = std::time::Instant::now();

            while let Ok(item) = rx.recv() {
                if cancel_flag_thread.load(Ordering::Relaxed) {
                    break;
                }
                batch.push(item);
                if batch.len() >= 20 || last_send.elapsed().as_millis() >= 100 {
                    let mut meta = HashMap::new();
                    meta.insert("files_scanned".to_string(), files_scanned_thread.load(Ordering::Relaxed));
                    meta.insert("matches_found".to_string(), matches_total_thread.load(Ordering::Relaxed));
                    let _ = channel.send(StreamedBatch::batch(std::mem::take(&mut batch), meta));
                    last_send = std::time::Instant::now();
                }
            }
            // Always report the end of the stream — even after a cancellation.
            // Without the `done` frame the frontend would never settle its
            // "Searching…" state (stale batches are dropped by the caller via
            // its cancellation-token check).
            let mut meta = HashMap::new();
            meta.insert("files_scanned".to_string(), files_scanned_thread.load(Ordering::Relaxed));
            meta.insert("matches_found".to_string(), matches_total_thread.load(Ordering::Relaxed));
            let _ = channel.send(StreamedBatch::finish(batch, meta));
        });

        let mut walker =
            ignore_rules::workspace_walker(Path::new(&workspace_path), !options.dot_files, &app_ignore_lines);
        walker.max_filesize(Some(max_file_size));
        let context_lines = options.context_lines;

        walker.build_parallel().run(|| {
            let tx = tx.clone();
            let cancel = cancel_flag.clone();
            let total = matches_total.clone();
            let scanned = files_scanned.clone();
            let matcher = matcher.clone();
            let root = workspace_path.clone();

            Box::new(move |result| {
                if cancel.load(Ordering::Relaxed) || total.load(Ordering::Relaxed) >= max_results {
                    return ignore::WalkState::Quit;
                }
                let entry = match result {
                    Ok(e) => e,
                    Err(_) => return ignore::WalkState::Continue,
                };
                if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    return ignore::WalkState::Continue;
                }
                scanned.fetch_add(1, Ordering::Relaxed);

                let path = entry.path();
                let mut sink = SearchSink {
                    matcher: &matcher,
                    matches: Vec::new(),
                    pending_before: Vec::new(),
                    in_after_context: false,
                    truncated: false,
                };
                let mut searcher = SearcherBuilder::new()
                    .line_terminator(LineTerminator::byte(b'\n'))
                    .line_number(true)
                    .multi_line(false)
                    .before_context(context_lines)
                    .after_context(context_lines)
                    .binary_detection(BinaryDetection::quit(b'\x00'))
                    .build();
                let _ = searcher.search_path(&matcher, path, &mut sink);

                if sink.matches.is_empty() {
                    return ignore::WalkState::Continue;
                }

                let full = path.to_string_lossy().into_owned();
                let display = path
                    .strip_prefix(&root)
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_else(|_| full.clone());
                let file_name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                let match_count = sink.matches.iter().filter(|m| !m.is_context).count();
                total.fetch_add(match_count, Ordering::Relaxed);

                let item = SearchFileItem {
                    path: full,
                    display_path: display,
                    file_name,
                    match_count,
                    matches: sink.matches,
                };
                if tx.send(item).is_err() {
                    return ignore::WalkState::Quit;
                }
                ignore::WalkState::Continue
            })
        });

        drop(tx);
        let _ = send_thread.join();

        let mut searches = registry_clone.blocking_lock();
        searches.remove(&cancel_token);
    });

    Ok(())
}

// ── Replace All (closed files: re-scan + atomic rewrite) ────────────────────

/// Replace occurrences in files that are NOT open as editor tabs. Every file is
/// re-read and re-scanned with the same regex at commit time (stale offsets from
/// the search are never used). Encoding + line endings of the original file are
/// preserved, and each file is written via temp-file + atomic rename so an
/// interrupted process can never leave a half-written file behind.
#[tauri::command]
pub async fn replace_all_files(
    options: ReplaceOptions,
    files: Vec<String>,
    channel: tauri::ipc::Channel<StreamedBatch<ReplaceProgress>>,
) -> Result<(), String> {
    let total = files.len();
    let done = Arc::new(AtomicUsize::new(0));
    let processed = done.clone();

    tokio::task::spawn_blocking(move || {
        let (tx, rx) = mpsc::channel::<ReplaceProgress>();

        let send_thread = thread::spawn(move || {
            let mut batch = Vec::new();
            while let Ok(prog) = rx.recv() {
                batch.push(prog);
                if batch.len() >= 10 {
                    let _ = channel.send(StreamedBatch::batch(std::mem::take(&mut batch), HashMap::new()));
                }
            }
            let mut meta = HashMap::new();
            meta.insert("total".to_string(), total);
            meta.insert("processed".to_string(), processed.load(Ordering::Relaxed));
            let _ = channel.send(StreamedBatch::finish(batch, meta));
        });

        // Bounded concurrency: a dedicated 8-thread pool keeps disk I/O
        // and memory usage predictable on huge workspaces.
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(8)
            .build()
            .unwrap();
        pool.install(|| {
            rayon::scope(|s| {
                for path in files {
                    let tx = tx.clone();
                    let matcher = matcher_for_replace(&options);
                    let opts = options.clone();
                    let done = done.clone();
                    s.spawn(move |_| {
                        let _ = tx.send(replace_one_file(&path, &matcher, &opts));
                        done.fetch_add(1, Ordering::Relaxed);
                    });
                }
            });
        });

        drop(tx);
        let _ = send_thread.join();
    });

    Ok(())
}

/// Build a `regex::Regex` mirroring the search options (case/word/regex) so the
/// commit-time re-scan behaves identically to the ripgrep pass that found the
/// matches. Capture groups (`$1`, `$name`) are honored in the replacement.
fn matcher_for_replace(opts: &ReplaceOptions) -> regex::Regex {
    let pattern = if opts.use_regex {
        opts.query.clone()
    } else {
        regex::escape(&opts.query)
    };
    let pattern = if opts.whole_word {
        format!(r"\b(?:{})\b", pattern)
    } else {
        pattern
    };
    regex::RegexBuilder::new(&pattern)
        .case_insensitive(!opts.case_sensitive)
        .multi_line(true)
        .build()
        .unwrap_or_else(|_| regex::RegexBuilder::new("").build().unwrap())
}

/// Detect the byte encoding (BOM → chardetng fallback, matching file_ops) and
/// return the decoded text plus the encoding used, so we can re-encode exactly.
fn decode_bytes(bytes: &[u8]) -> (String, &'static Encoding) {
    if let Ok(s) = std::str::from_utf8(bytes) {
        return (s.to_string(), UTF_8);
    }
    let encoding = Encoding::for_bom(bytes)
        .map(|(e, _)| e)
        .unwrap_or_else(|| {
            let mut detector = EncodingDetector::new(chardetng::Iso2022JpDetection::Allow);
            detector.feed(bytes, true);
            detector.guess(None, chardetng::Utf8Detection::Allow)
        });
    let (text, _, _) = encoding.decode(bytes);
    (text.into_owned(), encoding)
}

/// Write bytes to `path` via a same-directory temp file + atomic rename.
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let mut tmp = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    tmp.write_all(bytes).map_err(|e| e.to_string())?;
    tmp.flush().map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| e.error.to_string())?;
    Ok(())
}

fn replace_one_file(path: &str, re: &regex::Regex, opts: &ReplaceOptions) -> ReplaceProgress {
    let path_buf: PathBuf = path.into();
    let fail = |status: &str, message: String| ReplaceProgress {
        path: path.to_string(),
        status: status.to_string(),
        replaced: 0,
        message,
    };

    let bytes = match std::fs::read(&path_buf) {
        Ok(b) => b,
        Err(e) => return fail("error", format!("read failed: {}", e)),
    };
    // Never touch binary files.
    if bytes.contains(&0) {
        return fail("skipped", "binary file skipped".to_string());
    }

    let (decoded, encoding) = decode_bytes(&bytes);

    // Preserve the dominant line ending of the original file.
    let has_crlf = decoded.contains("\r\n");
    let normalized = decoded.replace("\r\n", "\n");

    let (new_text, replaced_count) = apply_regex_replace(&normalized, re, opts);

    if replaced_count == 0 {
        // File changed since the search — it no longer matches. Report and
        // skip instead of blindly writing stale replacements.
        return fail("skipped", "file no longer matches the search".to_string());
    }

    let final_text = if has_crlf {
        new_text.replace('\n', "\r\n")
    } else {
        new_text
    };

    let (out, _, _) = encoding.encode(&final_text);
    if let Err(e) = atomic_write(&path_buf, &out) {
        return fail("error", e);
    }
    ReplaceProgress {
        path: path.to_string(),
        status: "replaced".to_string(),
        replaced: replaced_count,
        message: String::new(),
    }
}

fn apply_regex_replace(normalized: &str, re: &regex::Regex, opts: &ReplaceOptions) -> (String, usize) {
    // In literal mode the replacement is plain text, so `$` must not be
    // interpreted as a capture-group reference (escape it like `$$`).
    let replacement = if opts.use_regex {
        opts.replace.clone()
    } else {
        opts.replace.replace('$', "$$")
    };
    let count = re.find_iter(normalized).count();
    let out = re.replace_all(normalized, replacement).into_owned();
    (out, count)
}
