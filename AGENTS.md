# AGENTS.md — Notron

Guidance for AI coding agents working in this repository. Read this before making changes.

## Project

Notron is a desktop code editor: **Tauri 2 (Rust)** backend + **Svelte 5** frontend (runes) + **CodeMirror 6** editor engine, built with **Bun**. Product requirements live in `PRD.md`; user-facing docs in `README.md`. Dev environment is Windows + PowerShell 5.1.

## Commands (run from repo root)

| Command | Purpose |
| --- | --- |
| `bun install` | Install frontend dependencies |
| `bun run dev` | Vite dev server (frontend only) |
| `bun run check` | `svelte-check`. **MUST finish with "0 errors and 0 warnings"** — this is the repo's quality gate |
| `bun run build` | Production frontend build (Vite) |
| `bun run tauri dev` | Full app (Vite + Rust) |
| `cargo check` (in `src-tauri/`) | Rust type check |

No test suite is configured yet. After any change, always run `bun run check` and fix what it reports.

## Codebase map

- `src/main.ts` — bootstrap, theme pre-load (theme list derived from the theme catalog).
- `src/App.svelte` — application shell: title bar, activity bar, sidebar, editor area, bottom panel, status bar, global modals & keyboard shortcuts.
- `src/lib/constants.ts` — **single source of truth** for all magic numbers, timings, thresholds and defaults. Never inline a literal; add it here first.
- `src/lib/components/common/` — shared UI primitives: Modal, Tooltip, Select, MultiSelect, DropdownMenu, ToastContainer, VirtualList, MaterialIcon, ...
- `src/lib/components/explorer/` — FileTree, TreeNode.
- `src/lib/components/editor/` — Editor (CodeMirror 6 wrapper), SplitEditorPane, SplitView, DiffEditor, MarkdownPreview, ImageViewer, GoToLineDialog, EditorSearchWidget, WelcomeTab.
- `src/lib/components/panels/` — BottomPanel (integrated terminal — renamed from TerminalPanel), SourceControlPanel, SearchPanel, RunPanel, SettingsPage, CommandPalette, TitleMenuBar, dialogs.
- `src/lib/stores/` — runes stores (`*.svelte.ts`): `editor`, `settings`, `theme`, `terminal`, `ui`, `navigation`, `palette`, `run`, `split`, `gitRepo`, `gitDecoration`.
- `src/lib/services/` — service layer: `git` (git CLI), `runService` (DAP), `entryPointResolver`.
- `src/lib/editor/` — CodeMirror 6 module-level extensions shared by editor instances: `breadcrumbs.ts`, `commonExtensions.ts`.
- `src/lib/utils/` — pure helpers: `path`, `replace`, `fileIcons`, `gitStatusStyles`, `treeFlattener`, `explorer`, `symbolEngine`, `languageDetector`, `markdownRender`, `materialIconMap`, `materialIconRenderer`, `breadcrumbPathIcons`, `stream`, `error`.
- `src-tauri/src/` — Rust backend: `db.rs` (SQLite/rusqlite), `file_ops.rs`, `search.rs` (ripgrep `grep` crate), `watcher_service.rs` (notify), `workspace_cache.rs`, `git_service.rs`, `symbol_index.rs`, `ignore_rules.rs`, `startup.rs`, `discord.rs`.

## Conventions

- **Svelte 5 runes only** (`$state`, `$derived`, `$effect`, `$props`). No legacy `.subscribe()` in components, no `$:` labels.
- Component placement is by feature: `components/{common,editor,explorer,panels}`. New shared components go in `common/`.
- Shared pure logic lives in `utils/`, **not** in a component's `<script module>` (e.g. git status styles and file icons were consolidated into `utils/`). Helpers must have exactly one source of truth.
- IPC: `invoke('snake_case_command', {...})` from `@tauri-apps/api/core`; the matching command handler lives in `src-tauri/src/`. When changing an IPC command, update both sides.
- Settings are scoped like VS Code: `HARDCODED_DEFAULTS ← user (global) ← workspace` (see `stores/settings.svelte.ts`). Workspace overrides are surfaced in the Settings page with a "Workspace" badge and a reset-to-global action.
- Keep comments that explain *why*; don't strip or reformat working code.

## Guardrails

- Never commit secrets/API keys; never add `.env` files to the repo.
- Never leave `bun run check` failing — it is the repo's gate (0 errors AND 0 warnings).
- Check `utils/` before writing a new helper; check `constants.ts` before using a magic number.
- Don't "force" refactors: if a component can't be split cleanly (e.g. `FileTree.svelte`, `App.svelte` — single large closures over shared state), leave it alone.
- Don't reintroduce the old flat layout or old names (`TerminalPanel`, `FindReplacePanel`).
- Shell commands must be PowerShell-compatible (use `;` to chain, quote paths with spaces).
