use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use regex::Regex;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SymbolLocation {
    pub file_path: String,
    pub line: usize,
    pub column: usize,
    pub name: String,
    pub kind: SymbolKind,
    pub parent: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum SymbolKind {
    Function,
    Method,
    Struct,
    Class,
    Trait,
    Enum,
    Interface,
    Variable,
    Constant,
    Type,
    Module,
    Macro,
    Constructor,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReferenceLocation {
    pub file_path: String,
    pub line: usize,
    pub column: usize,
    pub text: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct IndexStats {
    pub total_files: usize,
    pub total_symbols: usize,
    pub languages: Vec<String>,
}

pub struct SymbolIndex {
    pub symbols: HashMap<String, Vec<SymbolLocation>>,
    pub stats: IndexStats,
}

impl SymbolIndex {
    pub fn new() -> Self {
        SymbolIndex {
            symbols: HashMap::new(),
            stats: IndexStats {
                total_files: 0,
                total_symbols: 0,
                languages: Vec::new(),
            },
        }
    }
}

fn extract_symbols(content: &str, path: &str, lang: &str) -> Vec<SymbolLocation> {
    let mut symbols = Vec::new();

    match lang {
        "javascript" | "typescript" => {
            let pats: Vec<(Regex, SymbolKind, Option<&str>)> = vec![
                (Regex::new(r"(?:export\s+)?(?:async\s+)?function\s+(\w+)").unwrap(), SymbolKind::Function, None),
                (Regex::new(r"(?:export\s+)?class\s+(\w+)").unwrap(), SymbolKind::Class, None),
                (Regex::new(r"(?:export\s+)?interface\s+(\w+)").unwrap(), SymbolKind::Interface, None),
                (Regex::new(r"(?:export\s+)?(?:type|enum)\s+(\w+)").unwrap(), SymbolKind::Type, None),
                (Regex::new(r"(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]").unwrap(), SymbolKind::Variable, None),
                (Regex::new(r"(?:export\s+)?(?:default\s+)?function\s+\*?\s*(\w*)").unwrap(), SymbolKind::Function, None),
                (Regex::new(r"(?:public|private|protected)\s+(?:static\s+)?(\w+)\s*[=(]").unwrap(), SymbolKind::Method, None),
                (Regex::new(r"(?:public|private|protected)\s+(?:static\s+)?get\s+(\w+)").unwrap(), SymbolKind::Method, None),
                (Regex::new(r"(\w+)\s*[=:]\s*(?:async\s+)?\(?.*?\)\s*(?:=>|:)").unwrap(), SymbolKind::Variable, None),
            ];
            for (re, kind, _) in &pats {
                for cap in re.captures_iter(content) {
                    let name = cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                    if name.is_empty() || name == "if" || name == "for" || name == "while" || name == "switch" || name == "function" || name == "class" {
                        continue;
                    }
                    let line = content[..cap.get(0).unwrap().start()].lines().count();
                    let col = cap.get(0).unwrap().start() - content[..cap.get(0).unwrap().start()].rfind('\n').map(|i| i + 1).unwrap_or(0);
                    symbols.push(SymbolLocation {
                        file_path: path.to_string(),
                        line: line + 1,
                        column: col + 1,
                        name,
                        kind: kind.clone(),
                        parent: None,
                    });
                }
            }
        }
        "rust" => {
            // Filter out comments and strings to avoid false positives
            let cleaned = remove_rust_comments(content);
            let pats: Vec<(Regex, SymbolKind)> = vec![
                (Regex::new(r"(?:pub\s+)?(?:unsafe\s+)?fn\s+(\w+)").unwrap(), SymbolKind::Function),
                (Regex::new(r"(?:pub\s+)?struct\s+(\w+)").unwrap(), SymbolKind::Struct),
                (Regex::new(r"(?:pub\s+)?enum\s+(\w+)").unwrap(), SymbolKind::Enum),
                (Regex::new(r"(?:pub\s+)?trait\s+(\w+)").unwrap(), SymbolKind::Trait),
                (Regex::new(r"(?:pub\s+)?(?:unsafe\s+)?trait\s+(\w+)").unwrap(), SymbolKind::Trait),
                (Regex::new(r"(?:pub\s+)?type\s+(\w+)").unwrap(), SymbolKind::Type),
                (Regex::new(r"(?:pub\s+)?const\s+(\w+)").unwrap(), SymbolKind::Constant),
                (Regex::new(r"(?:pub\s+)?(?:static|let)\s+(?:mut\s+)?(\w+)").unwrap(), SymbolKind::Variable),
                (Regex::new(r"(?:pub\s+)?(?:async\s+)?fn\s+(\w+)").unwrap(), SymbolKind::Function),
                (Regex::new(r"impl\s+(\w+(?:\s*<[^>]*>)?)\s*(?:for\s+(\w+))?").unwrap(), SymbolKind::Module),
                (Regex::new(r"macro_rules!\s*(\w+)").unwrap(), SymbolKind::Macro),
                (Regex::new(r"(?:pub\s+)?use\s+(?:\w+\s*::\s*)*(\w+)\s*\{").unwrap(), SymbolKind::Module),
            ];
            for (re, kind) in &pats {
                for cap in re.captures_iter(&cleaned) {
                    let name = cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                    if name.is_empty() || name == "if" || name == "for" || name == "while" || name == "loop" || name == "match" || name == "let" || name == "Some" || name == "None" || name == "Ok" || name == "Err" {
                        continue;
                    }
                    let original_offset = map_cleaned_to_original_offset(content, &cleaned, cap.get(0).unwrap().start());
                    let line = content[..original_offset].lines().count();
                    let col = original_offset - content[..original_offset].rfind('\n').map(|i| i + 1).unwrap_or(0);
                    symbols.push(SymbolLocation {
                        file_path: path.to_string(),
                        line: line + 1,
                        column: col + 1,
                        name,
                        kind: kind.clone(),
                        parent: None,
                    });
                }
            }
        }
        "python" => {
            let pats: Vec<(Regex, SymbolKind)> = vec![
                (Regex::new(r"(?:async\s+)?def\s+(\w+)").unwrap(), SymbolKind::Function),
                (Regex::new(r"class\s+(\w+)").unwrap(), SymbolKind::Class),
                (Regex::new(r"(\w+)\s*=\s*(?:lambda|def|class)").unwrap(), SymbolKind::Variable),
            ];
            for (re, kind) in &pats {
                for cap in re.captures_iter(content) {
                    let name = cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                    if name.is_empty() || name.starts_with('_') {
                        continue;
                    }
                    let line = content[..cap.get(0).unwrap().start()].lines().count();
                    let col = cap.get(0).unwrap().start() - content[..cap.get(0).unwrap().start()].rfind('\n').map(|i| i + 1).unwrap_or(0);
                    symbols.push(SymbolLocation {
                        file_path: path.to_string(),
                        line: line + 1,
                        column: col + 1,
                        name,
                        kind: kind.clone(),
                        parent: None,
                    });
                }
            }
        }
        "go" => {
            let pats: Vec<(Regex, SymbolKind)> = vec![
                (Regex::new(r"func\s+(?:\([^)]*\)\s+)?(\w+)").unwrap(), SymbolKind::Function),
                (Regex::new(r"type\s+(\w+)\s+struct").unwrap(), SymbolKind::Struct),
                (Regex::new(r"type\s+(\w+)\s+interface").unwrap(), SymbolKind::Interface),
                (Regex::new(r"type\s+(\w+)\s+").unwrap(), SymbolKind::Type),
                (Regex::new(r"const\s+(\w+)").unwrap(), SymbolKind::Constant),
                (Regex::new(r"var\s+(\w+)").unwrap(), SymbolKind::Variable),
            ];
            for (re, kind) in &pats {
                for cap in re.captures_iter(content) {
                    let name = cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                    if name.is_empty() {
                        continue;
                    }
                    let line = content[..cap.get(0).unwrap().start()].lines().count();
                    let col = cap.get(0).unwrap().start() - content[..cap.get(0).unwrap().start()].rfind('\n').map(|i| i + 1).unwrap_or(0);
                    symbols.push(SymbolLocation {
                        file_path: path.to_string(),
                        line: line + 1,
                        column: col + 1,
                        name,
                        kind: kind.clone(),
                        parent: None,
                    });
                }
            }
        }
        "cpp" | "c" | "csharp" | "java" => {
            let pats: Vec<(Regex, SymbolKind)> = vec![
                (Regex::new(r"(?:public|private|protected|static|virtual|override)?\s*(?:virtual\s+)?(\w+)\s*\([^)]*\)\s*(?:const|override|final)?\s*\{").unwrap(), SymbolKind::Function),
                (Regex::new(r"(?:class|struct)\s+(\w+)").unwrap(), SymbolKind::Class),
                (Regex::new(r"enum\s+(?:class\s+)?(\w+)").unwrap(), SymbolKind::Enum),
                (Regex::new(r"interface\s+(\w+)").unwrap(), SymbolKind::Interface),
                (Regex::new(r"#define\s+(\w+)").unwrap(), SymbolKind::Constant),
                (Regex::new(r"template\s*<[^>]*>\s*(?:class|struct)\s+(\w+)").unwrap(), SymbolKind::Class),
            ];
            for (re, kind) in &pats {
                for cap in re.captures_iter(content) {
                    let name = cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                    if name.is_empty() || name == "if" || name == "for" || name == "while" || name == "switch" || name == "catch" {
                        continue;
                    }
                    let line = content[..cap.get(0).unwrap().start()].lines().count();
                    let col = cap.get(0).unwrap().start() - content[..cap.get(0).unwrap().start()].rfind('\n').map(|i| i + 1).unwrap_or(0);
                    symbols.push(SymbolLocation {
                        file_path: path.to_string(),
                        line: line + 1,
                        column: col + 1,
                        name,
                        kind: kind.clone(),
                        parent: None,
                    });
                }
            }
        }
        _ => {}
    }

    symbols
}

fn remove_rust_comments(content: &str) -> String {
    let mut result = String::with_capacity(content.len());
    let chars: Vec<char> = content.chars().collect();
    let len = chars.len();
    let mut i = 0;
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    let mut in_string = false;
    let mut in_char = false;

    while i < len {
        if in_line_comment {
            if chars[i] == '\n' {
                in_line_comment = false;
                result.push('\n');
            } else {
                result.push(' ');
            }
            i += 1;
            continue;
        }

        if in_block_comment {
            if i + 1 < len && chars[i] == '*' && chars[i + 1] == '/' {
                in_block_comment = false;
                result.push(' ');
                i += 2;
                continue;
            }
            if chars[i] == '\n' {
                result.push('\n');
            } else {
                result.push(' ');
            }
            i += 1;
            continue;
        }

        if in_string {
            result.push(chars[i]);
            if chars[i] == '\\' && i + 1 < len {
                i += 1;
                result.push(chars[i]);
            } else if chars[i] == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }

        if in_char {
            result.push(chars[i]);
            if chars[i] == '\\' && i + 1 < len {
                i += 1;
                result.push(chars[i]);
            } else if chars[i] == '\'' {
                in_char = false;
            }
            i += 1;
            continue;
        }

        if chars[i] == '/' && i + 1 < len {
            if chars[i + 1] == '/' {
                in_line_comment = true;
                result.push(' ');
                i += 2;
                continue;
            }
            if chars[i + 1] == '*' {
                in_block_comment = true;
                result.push(' ');
                i += 2;
                continue;
            }
        }

        if chars[i] == '"' {
            in_string = true;
        }
        if chars[i] == '\'' && i + 1 < len && chars[i + 1] != '\'' {
            in_char = true;
        }

        result.push(chars[i]);
        i += 1;
    }

    result
}

fn map_cleaned_to_original_offset(original: &str, cleaned: &str, cleaned_offset: usize) -> usize {
    let mut orig_i = 0;
    let mut clean_i = 0;
    let orig_chars: Vec<char> = original.chars().collect();
    let clean_chars: Vec<char> = cleaned.chars().collect();

    while clean_i < cleaned_offset && orig_i < orig_chars.len() {
        if clean_chars[clean_i] == orig_chars[orig_i] {
            clean_i += 1;
            orig_i += 1;
        } else {
            orig_i += 1;
        }
    }
    orig_i
}

fn detect_language_from_ext(path: &str) -> &'static str {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let lang = crate::file_ops::get_language_from_ext(&ext);
    if lang == "plaintext" {
        ""
    } else {
        lang
    }
}

/// Shared ignore rules — Layer 2 search/scan exclude.
fn is_ignored(path: &str) -> bool {
    crate::ignore_rules::is_search_excluded_path(Path::new(path))
}

#[tauri::command]
pub async fn get_file_symbols(path: String) -> Result<Vec<SymbolLocation>, String> {
    tokio::task::spawn_blocking(move || {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let lang = detect_language_from_ext(&path);
        if lang.is_empty() {
            return Ok(Vec::new());
        }
        Ok(extract_symbols(&content, &path, lang))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn index_workspace(root: String) -> Result<IndexStats, String> {
    tokio::task::spawn_blocking(move || {
        let mut index = SymbolIndex::new();
        let mut lang_set = std::collections::BTreeSet::new();

        let root_path = Path::new(&root);
        if !root_path.exists() {
            return Err("Workspace path does not exist".to_string());
        }

        for entry in WalkDir::new(root_path).into_iter().filter_map(|e| e.ok()) {
            if index.stats.total_files > 50000 {
                break;
            }
            let path_str = entry.path().to_string_lossy().into_owned();
            if entry.file_type().is_dir() || is_ignored(&path_str) {
                continue;
            }
            let lang = detect_language_from_ext(&path_str);
            if lang.is_empty() {
                continue;
            }

            if let Ok(content) = fs::read_to_string(entry.path()) {
                let symbols = extract_symbols(&content, &path_str, lang);
                for sym in symbols {
                    index.symbols.entry(sym.name.clone()).or_default().push(sym);
                    index.stats.total_symbols += 1;
                }
                index.stats.total_files += 1;
                lang_set.insert(lang.to_string());
            }
        }
        index.stats.languages = lang_set.into_iter().collect();

        Ok(index.stats)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_symbol_index(root: String) -> Result<HashMap<String, Vec<SymbolLocation>>, String> {
    tokio::task::spawn_blocking(move || {
        let mut index = SymbolIndex::new();

        let root_path = Path::new(&root);
        if !root_path.exists() {
            return Err("Workspace path does not exist".to_string());
        }

        for entry in WalkDir::new(root_path).into_iter().filter_map(|e| e.ok()) {
            if index.stats.total_files > 50000 {
                break;
            }
            let path_str = entry.path().to_string_lossy().into_owned();
            if entry.file_type().is_dir() || is_ignored(&path_str) {
                continue;
            }
            let lang = detect_language_from_ext(&path_str);
            if lang.is_empty() {
                continue;
            }

            if let Ok(content) = fs::read_to_string(entry.path()) {
                let symbols = extract_symbols(&content, &path_str, lang);
                for sym in symbols {
                    index.symbols.entry(sym.name.clone()).or_default().push(sym);
                }
                index.stats.total_files += 1;
            }
        }

        Ok(index.symbols)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn goto_definition(root: String, symbol: String, current_file: String) -> Result<Vec<SymbolLocation>, String> {
    tokio::task::spawn_blocking(move || {
        let mut results = Vec::new();
        let root_path = Path::new(&root);
        if !root_path.exists() {
            return Err("Workspace path does not exist".to_string());
        }

        if symbol.contains('/') || symbol.contains('.') || symbol.contains('\\') {
            let target_path = PathBuf::from(&symbol);
            if !target_path.is_absolute() {
                if let Some(parent) = Path::new(&current_file).parent() {
                    let mut to_check = vec![
                        parent.join(&symbol),
                        Path::new(&root).join(&symbol)
                    ];
                    let exts = vec![".ts", ".js", ".svelte", ".rs", "/index.ts", "/index.js", "/index.svelte"];
                    
                    let parent_joined = parent.join(&symbol);
                    for ext in &exts {
                        to_check.push(PathBuf::from(format!("{}{}", parent_joined.display(), ext)));
                    }
                    
                    for p in to_check {
                        if p.exists() && p.is_file() {
                            results.push(SymbolLocation {
                                file_path: p.to_string_lossy().to_string(),
                                line: 1,
                                column: 1,
                                name: symbol.clone(),
                                kind: SymbolKind::Module,
                                parent: None,
                            });
                            return Ok(results);
                        }
                    }
                }
            } else if target_path.exists() && target_path.is_file() {
                results.push(SymbolLocation {
                    file_path: target_path.to_string_lossy().to_string(),
                    line: 1,
                    column: 1,
                    name: symbol.clone(),
                    kind: SymbolKind::Module,
                    parent: None,
                });
                return Ok(results);
            }
        }

        // Check current file first (faster)
        if let Ok(content) = fs::read_to_string(&current_file) {
            let lang = detect_language_from_ext(&current_file);
            let symbols = extract_symbols(&content, &current_file, lang);
            for sym in symbols {
                if sym.name == symbol {
                    results.push(sym);
                }
            }
        }

        // If not found, search whole workspace (limited scope)
        if results.is_empty() {
            let mut count = 0;
            for entry in WalkDir::new(root_path).into_iter().filter_map(|e| e.ok()) {
                if count > 5000 { break; }
                let path_str = entry.path().to_string_lossy().into_owned();
                if entry.file_type().is_dir() || is_ignored(&path_str) {
                    continue;
                }
                let lang = detect_language_from_ext(&path_str);
                if lang.is_empty() { continue; }
                if let Ok(content) = fs::read_to_string(entry.path()) {
                    let symbols = extract_symbols(&content, &path_str, lang);
                    for sym in symbols {
                        if sym.name == symbol {
                            results.push(sym);
                            count += 1;
                        }
                    }
                }
            }
        }

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn find_references(root: String, symbol: String) -> Result<Vec<ReferenceLocation>, String> {
    tokio::task::spawn_blocking(move || {
        let mut results = Vec::new();
        let root_path = Path::new(&root);
        if !root_path.exists() {
            return Err("Workspace path does not exist".to_string());
        }

        let mut count = 0;
        for entry in WalkDir::new(root_path).into_iter().filter_map(|e| e.ok()) {
            if count > 10000 { break; }
            let path_str = entry.path().to_string_lossy().into_owned();
            if entry.file_type().is_dir() || is_ignored(&path_str) {
                continue;
            }
            let lang = detect_language_from_ext(&path_str);
            if lang.is_empty() { continue; }
            if let Ok(content) = fs::read_to_string(entry.path()) {
                let mut line_num = 1;
                for line in content.lines() {
                    if line.contains(&symbol) {
                        results.push(ReferenceLocation {
                            file_path: path_str.clone(),
                            line: line_num,
                            column: line.find(&symbol).unwrap_or(0) + 1,
                            text: line.trim().to_string(),
                        });
                        count += 1;
                        if results.len() > 500 {
                            return Ok(results);
                        }
                    }
                    line_num += 1;
                }
            }
        }

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn rename_symbol(root: String, symbol: String, new_name: String, current_file: String) -> Result<u32, String> {
    tokio::task::spawn_blocking(move || {
        let root_path = Path::new(&root);
        if !root_path.exists() {
            return Err("Workspace path does not exist".to_string());
        }

        let mut replace_count = 0u32;
        let mut count = 0;

        for entry in WalkDir::new(root_path).into_iter().filter_map(|e| e.ok()) {
            if count > 5000 { break; }
            let path_str = entry.path().to_string_lossy().into_owned();
            if entry.file_type().is_dir() || is_ignored(&path_str) {
                continue;
            }
            let lang = detect_language_from_ext(&path_str);
            if lang.is_empty() && path_str != current_file {
                continue;
            }

            if let Ok(content) = fs::read_to_string(entry.path()) {
                if content.contains(&symbol) {
                    let new_content = content.replace(&symbol, &new_name);
                    if content != new_content {
                        let changes = content.matches(&symbol).count() as u32;
                        fs::write(entry.path(), &new_content).map_err(|e| e.to_string())?;
                        replace_count += changes;
                    }
                }
            }
            count += 1;
        }

        Ok(replace_count)
    })
    .await
    .map_err(|e| e.to_string())?
}
