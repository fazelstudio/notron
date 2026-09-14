//! Extension Packages
//!
//! Installs and discovers signed-offline `.ntrn` packages without allowing archive entries to escape their destination.

use serde::Serialize;
use serde_json::Value;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};
use zip::ZipArchive;

const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;
const MAX_PACKAGE_BYTES: u64 = 250 * 1024 * 1024;

#[derive(Debug, Serialize, Clone)]
pub struct InstalledExtension {
    pub id: String,
    pub manifest: Value,
    pub path: String,
    pub source: String,
}

#[derive(Debug, Serialize)]
pub struct ExtensionDiscovery {
    pub extensions: Vec<InstalledExtension>,
    pub errors: Vec<String>,
}

fn extension_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Unable to resolve application data directory: {e}"))?
        .join("extensions");
    fs::create_dir_all(&root).map_err(|e| format!("Unable to create extension directory: {e}"))?;
    Ok(root)
}

fn validate_id(id: &str) -> bool {
    let mut parts = id.split('.');
    let valid_part = |part: &str| {
        !part.is_empty()
            && part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    };
    match (parts.next(), parts.next(), parts.next()) {
        (Some(publisher), Some(name), None) => valid_part(publisher) && valid_part(name),
        _ => false,
    }
}

fn validate_manifest(manifest: &Value) -> Result<(String, String), String> {
    let object = manifest
        .as_object()
        .ok_or_else(|| "manifest.json must contain a JSON object".to_string())?;
    let id = object
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "manifest.id is required".to_string())?;
    if !validate_id(id) {
        return Err("manifest.id must use publisher.name format".to_string());
    }
    for key in ["name", "version", "publisher", "main"] {
        if object.get(key).and_then(Value::as_str).map(str::trim).unwrap_or("").is_empty() {
            return Err(format!("manifest.{key} is required"));
        }
    }
    let publisher = object.get("publisher").and_then(Value::as_str).unwrap_or_default();
    if id.split('.').next() != Some(publisher) {
        return Err("manifest.id publisher must match manifest.publisher".to_string());
    }
    let version = object.get("version").and_then(Value::as_str).unwrap_or_default();
    let version_parts: Vec<&str> = version.split('.').collect();
    if version_parts.len() < 3
        || version_parts[..3].iter().enumerate().any(|(index, part)| {
            let numeric = if index == 2 {
                part.split(['-', '+']).next().unwrap_or(part)
            } else {
                *part
            };
            numeric.parse::<u64>().is_err()
        })
    {
        return Err("manifest.version must be a semantic version".to_string());
    }
    let engines = object
        .get("engines")
        .and_then(Value::as_object)
        .and_then(|engines| engines.get("notron"))
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("");
    if engines.is_empty() {
        return Err("manifest.engines.notron is required".to_string());
    }
    let main = object.get("main").and_then(Value::as_str).unwrap_or_default();
    if Path::new(main).is_absolute() || main.contains('\\') {
        return Err("manifest.main must be a relative POSIX path".to_string());
    }
    let activation = object
        .get("activationEvents")
        .and_then(Value::as_array)
        .ok_or_else(|| "manifest.activationEvents must be an array".to_string())?;
    if activation.is_empty() || activation.iter().any(|v| {
        let value = v.as_str().map(str::trim).unwrap_or("");
        value.is_empty()
            || (!matches!(value, "*" | "onUri" | "onStartupFinished")
                && !["onCommand:", "onLanguage:", "onView:", "workspaceContains:", "onCustomEditor:"]
                    .iter()
                    .any(|prefix| value.starts_with(prefix) && value.len() > prefix.len()))
    }) {
        return Err("manifest.activationEvents must contain non-empty strings".to_string());
    }
    if let Some(permissions) = object.get("permissions") {
        let permissions = permissions
            .as_array()
            .ok_or_else(|| "manifest.permissions must be an array".to_string())?;
        let allowed = [
            "fs:workspace-read",
            "fs:workspace-write",
            "fs:outside-workspace",
            "shell:execute",
            "network:fetch",
            "clipboard:read",
            "clipboard:write",
        ];
        if permissions.iter().any(|permission| {
            permission
                .as_str()
                .map(|value| !allowed.contains(&value))
                .unwrap_or(true)
        }) {
            return Err("manifest.permissions contains an unknown permission".to_string());
        }
    }
    Ok((id.to_string(), main.to_string()))
}

fn safe_entry_path(root: &Path, name: &str) -> Result<PathBuf, String> {
    if name.is_empty() || name.contains('\\') {
        return Err(format!("Invalid archive entry path: {name:?}"));
    }
    let relative = Path::new(name);
    if relative.is_absolute() || relative.components().any(|component| {
        matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_))
    }) {
        return Err(format!("Archive entry escapes extension directory: {name}"));
    }
    Ok(root.join(relative))
}

fn read_limited<R: Read>(reader: &mut R, limit: u64) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    reader
        .take(limit + 1)
        .read_to_end(&mut output)
        .map_err(|e| format!("Unable to read package entry: {e}"))?;
    if output.len() as u64 > limit {
        return Err("Package entry is larger than the allowed limit".to_string());
    }
    Ok(output)
}

fn load_installed(root: &Path, source: &str) -> (Vec<InstalledExtension>, Vec<String>) {
    let mut extensions = Vec::new();
    let mut errors = Vec::new();
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return (extensions, errors),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let manifest_path = path.join("manifest.json");
        let raw = match fs::read_to_string(&manifest_path) {
            Ok(raw) => raw,
            Err(e) => {
                errors.push(format!("{}: unable to read manifest: {e}", path.display()));
                continue;
            }
        };
        let manifest: Value = match serde_json::from_str(&raw) {
            Ok(manifest) => manifest,
            Err(e) => {
                errors.push(format!("{}: invalid manifest JSON: {e}", path.display()));
                continue;
            }
        };
        let (id, main) = match validate_manifest(&manifest) {
            Ok(values) => values,
            Err(error) => {
                errors.push(format!("{}: invalid manifest: {error}", path.display()));
                continue;
            }
        };
        if !main.to_ascii_lowercase().ends_with(".js") || !path.join(&main).is_file() {
            errors.push(format!("{}: manifest.main does not point to a bundled JavaScript file", path.display()));
            continue;
        }
        extensions.push(InstalledExtension {
            id,
            manifest,
            path: path.to_string_lossy().into_owned(),
            source: source.to_string(),
        });
    }
    (extensions, errors)
}

#[tauri::command]
pub fn list_installed_extensions(
    app: AppHandle,
    workspace: Option<String>,
) -> Result<ExtensionDiscovery, String> {
    let global_root = extension_root(&app)?;
    let (mut extensions, mut errors) = load_installed(&global_root, "global");
    if let Some(workspace) = workspace.filter(|value| !value.trim().is_empty()) {
        let workspace_root = PathBuf::from(workspace).join(".notron").join("extensions");
        let (local, local_errors) = load_installed(&workspace_root, "workspace");
        errors.extend(local_errors);
        for extension in local {
            extensions.retain(|existing| existing.id != extension.id);
            extensions.push(extension);
        }
    }
    extensions.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(ExtensionDiscovery { extensions, errors })
}

#[tauri::command]
pub fn install_ntrn_extension(
    app: AppHandle,
    package_path: String,
) -> Result<InstalledExtension, String> {
    let package = PathBuf::from(package_path);
    if !package.is_file() {
        return Err("Selected extension package does not exist".to_string());
    }
    if package.extension().and_then(|ext| ext.to_str()).map(|ext| ext.to_ascii_lowercase()) != Some("ntrn".to_string()) {
        return Err("Only .ntrn extension packages can be installed".to_string());
    }
    let file = File::open(&package).map_err(|e| format!("Unable to open extension package: {e}"))?;
    let size = file.metadata().map_err(|e| format!("Unable to inspect package: {e}"))?.len();
    if size > MAX_PACKAGE_BYTES {
        return Err("Extension package exceeds the 250 MB limit".to_string());
    }
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Invalid .ntrn archive: {e}"))?;
    let mut manifest: Option<Value> = None;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|e| format!("Unable to inspect archive: {e}"))?;
        let name = entry.name().to_string();
        let _ = safe_entry_path(Path::new("."), &name)?;
        if name == "manifest.json" {
            let data = read_limited(&mut entry, MAX_MANIFEST_BYTES)?;
            manifest = Some(serde_json::from_slice(&data).map_err(|e| format!("Invalid manifest.json: {e}"))?);
        }
    }
    let manifest = manifest.ok_or_else(|| "The .ntrn package is missing manifest.json".to_string())?;
    let (id, main) = validate_manifest(&manifest)?;
    if !main.to_ascii_lowercase().ends_with(".js") {
        return Err("manifest.main must point to a bundled JavaScript file".to_string());
    }

    let root = extension_root(&app)?;
    let destination = root.join(&id);
    let staging = root.join(format!(".{id}.installing"));
    if staging.exists() {
        fs::remove_dir_all(&staging).map_err(|e| format!("Unable to clear interrupted installation: {e}"))?;
    }
    fs::create_dir_all(&staging).map_err(|e| format!("Unable to create installation directory: {e}"))?;
    let result = (|| {
        let file = File::open(&package).map_err(|e| format!("Unable to reopen package: {e}"))?;
        let mut archive = ZipArchive::new(file).map_err(|e| format!("Invalid .ntrn archive: {e}"))?;
        let mut total = 0u64;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(|e| format!("Unable to read archive entry: {e}"))?;
            let output = safe_entry_path(&staging, entry.name())?;
            if entry.is_dir() {
                fs::create_dir_all(&output).map_err(|e| format!("Unable to create extension directory: {e}"))?;
                continue;
            }
            let size = entry.size();
            total = total.saturating_add(size);
            if total > MAX_PACKAGE_BYTES {
                return Err("Unpacked extension exceeds the 250 MB limit".to_string());
            }
            if let Some(parent) = output.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("Unable to create extension directory: {e}"))?;
            }
            let mut output_file = File::create(&output).map_err(|e| format!("Unable to create extension file: {e}"))?;
            std::io::copy(&mut entry, &mut output_file).map_err(|e| format!("Unable to extract extension file: {e}"))?;
            output_file.flush().map_err(|e| format!("Unable to flush extension file: {e}"))?;
        }
        if !staging.join(&main).is_file() {
            return Err(format!("manifest.main does not exist in package: {main}"));
        }
        if destination.exists() {
            fs::remove_dir_all(&destination).map_err(|e| format!("Unable to replace existing extension: {e}"))?;
        }
        fs::rename(&staging, &destination).map_err(|e| format!("Unable to finalize extension installation: {e}"))?;
        Ok(())
    })();
    if result.is_err() && staging.exists() {
        let _ = fs::remove_dir_all(&staging);
    }
    result?;
    Ok(InstalledExtension {
        id,
        manifest,
        path: destination.to_string_lossy().into_owned(),
        source: "global".to_string(),
    })
}

#[tauri::command]
pub fn uninstall_ntrn_extension(app: AppHandle, id: String) -> Result<(), String> {
    if !validate_id(&id) {
        return Err("Invalid extension id".to_string());
    }
    let root = extension_root(&app)?;
    let destination = root.join(&id);
    if !destination.is_dir() {
        return Err("Extension is not installed globally".to_string());
    }
    fs::remove_dir_all(destination).map_err(|e| format!("Unable to uninstall extension: {e}"))
}

#[tauri::command]
pub fn read_extension_module(
    app: AppHandle,
    extension_path: String,
    relative_path: String,
    workspace: Option<String>,
) -> Result<String, String> {
    let root = PathBuf::from(&extension_path)
        .canonicalize()
        .map_err(|e| format!("Unable to resolve extension directory: {e}"))?;
    let global_root = extension_root(&app)?.canonicalize().map_err(|e| e.to_string())?;
    let mut allowed = vec![global_root];
    if let Some(workspace) = workspace.filter(|value| !value.trim().is_empty()) {
        let workspace_root = PathBuf::from(workspace).join(".notron").join("extensions");
        if workspace_root.exists() {
            allowed.push(
                workspace_root
                    .canonicalize()
                    .map_err(|e| format!("Unable to resolve workspace extension directory: {e}"))?,
            );
        }
    }
    if !allowed.iter().any(|allowed_root| root.starts_with(allowed_root)) {
        return Err("Extension directory is outside the managed extension roots".to_string());
    }
    let module = safe_entry_path(&root, &relative_path)?;
    let module = module
        .canonicalize()
        .map_err(|e| format!("Unable to resolve extension entry module: {e}"))?;
    if !module.starts_with(&root) || !module.is_file() {
        return Err("Extension entry module does not exist".to_string());
    }
    let metadata = fs::metadata(&module).map_err(|e| format!("Unable to inspect extension module: {e}"))?;
    if metadata.len() > MAX_PACKAGE_BYTES {
        return Err("Extension entry module exceeds the allowed limit".to_string());
    }
    fs::read_to_string(module).map_err(|e| format!("Unable to read extension entry module: {e}"))
}
