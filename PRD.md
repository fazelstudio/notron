# Product Requirements Document (PRD) — Notron

## 1. Project Overview

**Notron** is a modern desktop code editor designed for speed, efficiency, and a minimal yet powerful user experience. Built with **Tauri** for the backend (Rust) and **Svelte 5** for the frontend, Notron delivers native application performance with the flexibility of web technologies.

### 1.1. Architecture

- **Package Manager:** Bun
- **Stack:** Tauri + Svelte + Rust
- **Editor Engine:** CodeMirror 6

### 1.2. Goals

- Provide a lightweight alternative to Electron-based editors with significantly lower memory and CPU usage.
- Achieve fast startup and responsive interaction even on large workspaces.
- Offer a modern, minimal UI that remains fully featured.

### 1.3. Non-Goals (Out of Scope for v1)

- Full IntelliSense / language server integration (planned for later via LSP).
- Collaborative real-time editing (planned for a future phase).
- Plugin ecosystem / extension marketplace (planned).

## 2. Target Users

- **Software Engineers:** Developers who need a lightweight editor for quick edits or medium-sized project management.
- **Web Developers:** Users familiar with modern ecosystems such as VS Code who want a more resource-efficient application.
- **Writers / Note-takers:** Users who frequently work with Markdown.

## 3. Core Features

### 3.1. File & Workspace Management

- **File Tree Explorer:** Hierarchical navigation of the folder structure.
- **File Operations (CRUD):** Create files/folders, rename, delete, plus Copy, Cut, and Paste operations (single and multi-select).
- **Workspace Restoration:** Remembers the last opened folder, sidebar layout, expanded folders, and open tabs when the app is relaunched.
- **File Watcher:** Real-time synchronization between files on disk and the editor view (using an optimized recursive watcher).
- **Ignore & Exclude Rules:** Respect `.gitignore` and user-defined ignore patterns (e.g. `node_modules`, `.git`) to keep the tree and global search clean.

### 3.2. Code Editor (Core)

- **CodeMirror 6 Engine:** World-class editor integration with high performance.
- **Multi-tab Interface:** Open many files simultaneously in tabs.
- **Syntax Highlighting:** Automatic support for many languages (JS, TS, Rust, Python, Go, C++, HTML, CSS, JSON, Markdown, and more).
- **Lazy Loading:** File contents are only loaded into memory when the tab is active to save RAM.
- **Auto-save:** Automatic saving based on a configurable duration.
- **Search & Replace:** In-editor find/replace with regex support.

### 3.3. Navigation & Code Intelligence

- **Command Palette** (`Ctrl+Shift+P`): Quick access to every application command.
- **Symbol Engine:** Extraction of symbols (functions, classes, variables) via regex to power "Go to Definition" and "Find References".
- **Go To Line** (`Ctrl+G`): Quick navigation to a specific line in a file.
- **Global Search:** Search text across the entire workspace with automatic directory filtering (ripgrep engine).

### 3.4. User Interface (UI/UX)

- **Custom Title Bar:** Frameless window for a modern, integrated look.
- **Theming:** Dark and Light themes, plus an option to follow the OS scheme.
- **Skeleton Loading:** Fast initial rendering with placeholders while workspace data loads.
- **Markdown Preview:** Real-time visual rendering for `.md` files.
- **Image Viewer:** Preview image files directly in a tab.

### 3.5. Terminal & Developer Tools

- **Integrated Terminal:** xterm.js-powered terminal (via `tauri-pty`) with multiple instances.
- **Source Control (Git):** Stage, commit, push/pull, discard, logs, and diff viewing.
- **Run & Debug:** DAP (Debug Adapter Protocol) integration with breakpoints, call stack, and variables.

## 4. Technology Stack

| Category            | Technology                                              |
| ------------------- | ------------------------------------------------------- |
| Frontend Framework  | Svelte 5 (using Runes for efficient reactivity)         |
| Backend Runtime     | Tauri 2.0 (Rust)                                        |
| Runtime / Package Mgr | Bun                                                |
| Editor Engine       | CodeMirror 6                                            |
| Database            | SQLite (via rusqlite) for settings and file history     |
| Styling             | Tailwind CSS v4 + CSS custom properties (theme variables) |

## 5. Non-Functional Requirements

### 5.1. Performance

- **Startup Time:** The app must show a functional UI in under 2 seconds.
- **Memory Usage:** Memory usage should stay below 200MB for standard use (significantly lower than Electron).
- **Reactivity:** The UI must not hang during deep file tree operations or global search.

### 5.2. Security

- **File Isolation:** The app only has access to directories granted permission by the OS through the Tauri API.
- **Data Persistence:** User settings are stored locally in the `AppData` directory (Windows) or equivalent on other OSes.
- **Input Validation:** All IPC inputs are validated; paths are normalized and confined to allowed scopes.

### 5.3. Reliability

- **Crash Recovery:** On abnormal exit, dirty tab snapshots are persisted and restored on next launch.
- **Logging:** Structured logging in debug builds and rolling file logs in production.

## 6. Technical Architecture

The application is optimized using the modern **Svelte 5 Store Pattern**:

- Avoids manual `.subscribe()` calls in components.
- Uses `$derived` for derived state.
- Uses isolated `$effect` implementations for heavy features such as the file watcher.

### 6.1. Frontend (Svelte 5)

```
src/main.ts                      — bootstrap & theme pre-load (derived from the theme catalog)
src/App.svelte                   — application shell: title bar, activity bar, sidebar, editor
                                   area, bottom panel, status bar, global modals & shortcuts
src/lib/constants.ts             — single source of truth for timings, thresholds and defaults
src/lib/components/common/       — shared UI primitives (Modal, Tooltip, Select, MultiSelect,
                                   DropdownMenu, ToastContainer, VirtualList, MaterialIcon, ...)
src/lib/components/explorer/     — file tree (FileTree.svelte, TreeNode.svelte)
src/lib/components/editor/       — editor & tab surfaces (Editor, SplitEditorPane, SplitView,
                                   DiffEditor, MarkdownPreview, ImageViewer, GoToLineDialog,
                                   EditorSearchWidget, WelcomeTab)
src/lib/components/panels/       — panels & dialogs (BottomPanel/Terminal, SourceControlPanel,
                                    SearchPanel, RunPanel, CommandPalette,
                                    SettingsPage, TitleMenuBar, ...)
src/lib/stores/                  — reactive stores (runes): editor, settings.svelte.ts, theme,
                                   terminal, ui, navigation, palette, run, split, gitRepo,
                                   gitDecoration
src/lib/services/                — service layer: git (git CLI), runService (DAP),
                                   entryPointResolver
src/lib/editor/                  — CodeMirror 6 module-level extensions shared by every editor
                                   instance (breadcrumbs.ts, commonExtensions.ts)
src/lib/utils/                   — pure helpers: path, replace, fileIcons, gitStatusStyles,
                                   treeFlattener, explorer, symbolEngine, languageDetector,
                                   markdownRender, materialIconMap, materialIconRenderer,
                                   breadcrumbPathIcons, stream, error
```

- **Store pattern:** components read stores through runes (`$state`, `$derived`, `$effect`)
  and never call `.subscribe()` manually; heavy side effects (file watcher, IPC hydration)
  are isolated in single `$effect` blocks.
- **Settings scoping:** settings are layered like VS Code — `HARDCODED_DEFAULTS ← user
  (global) ← workspace` — and persisted through `save_global_setting` /
  `save_workspace_setting` IPC (see `settings.svelte.ts`).
- **IPC:** all frontend-backend communication uses `invoke()` from `@tauri-apps/api/core`
  with snake_case command names (`load_global_settings`, `read_directory`, `fs-change`
  events, ...).

### 6.2. Backend (Tauri / Rust)

- `src-tauri/src/main.rs` / `lib.rs` — entry points.
- `src-tauri/src/config.rs` — application & critical configuration management.
- `src-tauri/src/db.rs` — SQLite persistence (rusqlite + r2d2 pool) for settings,
  workspace state and file history.
- `src-tauri/src/file_ops.rs` — file/directory operations and streaming reads
  (`stream.rs`).
- `src-tauri/src/search.rs` — global search (ripgrep `grep` crate) and replace-all.
- `src-tauri/src/watcher_service.rs` — unified file watcher (`notify`); emits the single
  `fs-change` event the frontend reacts to.
- `src-tauri/src/workspace_cache.rs` — Rust-side explorer cache (source of truth for the
  file tree).
- `src-tauri/src/git_service.rs` — git operations (status/stage/commit/log/... via the
  git CLI).
- `src-tauri/src/symbol_index.rs` — symbol extraction (regex) and workspace indexing.
- `src-tauri/src/ignore_rules.rs` — `.gitignore` / `.notronignore` parsing and matching
  (`ignore` crate).
- `src-tauri/src/startup.rs` — startup orchestration: workspace restore and state
  hydration in a single IPC round-trip.
- `src-tauri/src/discord.rs` — Discord Rich Presence integration.

## 7. Success Metrics

- Startup time under 2 seconds on typical hardware.
- Memory usage below 200MB during standard editing sessions.
- Global search across a 100k+ file repository completes without blocking the UI.
- Community adoption: number of GitHub stars, contributors, and open issues resolved.
