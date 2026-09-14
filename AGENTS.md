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
- `src/lib/constants/` — **single source of truth** for all magic numbers, timings, thresholds and defaults. `index.ts` for constants, `languages.json` for extension-to-language mapping. Never inline a literal; add it here first.
- `src/lib/themes/` — CodeMirror theme definitions and CSS variable injection (`index.ts`).
- `src/lib/extensions/` — Internal feature modules (Notron has no additional extensions). Each sub-folder is a self-contained feature:
  - `extensions/material-icons/` — Material Icon Theme: SVG assets, icon map, renderer, `MaterialIcon.svelte` component, breadcrumb/file icon helpers.
- `src/lib/components/common/` — shared UI primitives: Modal, Tooltip, Select, MultiSelect, DropdownMenu, ToastContainer, VirtualList, ContextMenu, ViewTitleMenu (registry-driven title menu), FileIcon (theme-driven icon), QuickPickDialog, InputBoxDialog, ...
- `src/lib/components/explorer/` — FileTree, TreeNode.
- `src/lib/components/editor/` — Editor (CodeMirror 6 wrapper), SplitEditorPane, SplitView, DiffEditor, MarkdownPreview, ImageViewer, GoToLineDialog, EditorSearchWidget, WelcomeTab.
- `src/lib/components/panels/` — BottomPanel (integrated terminal), ScmView (generic SCM provider host), SourceControlPanel (git provider view), SearchPanel, RunPanel, SettingsPage, CommandPalette, TitleMenuBar, dialogs.
- `src/lib/components/shell/` — shell chrome: ActivityBar, Sidebar, TitleBar, StatusBar (all registry-driven).
- `src/lib/stores/` — runes stores (`*.svelte.ts`): `editor`, `settings`, `theme`, `terminal`, `ui`, `navigation`, `palette`, `run`, `split`, `gitRepo`, `gitDecoration`, `sourceControl`.
- `src/lib/services/` — service layer: `git` (git CLI), `runService` (DAP), `entryPointResolver`, `fileService` (typed file-system abstraction), `notificationService` (toast wrapper), `dialogService` (quick pick / input box / progress / file dialogs), `workspace/sessionService`.
- `src/lib/services/run/` — built-in run providers (one per runtime, registered in `runProviderRegistry`).
- `src/lib/services/editor/` — `fileOperations` (central open/new-file logic).
- `src/lib/editor/` — CodeMirror 6 module-level extensions shared by editor instances: `breadcrumbs.ts`, `commonExtensions.ts`, `searchResultHighlight.ts`, `extensionRegistry.ts`, `languageRegistry.ts`.
- `src/lib/commands/` — command registry, keybinding registry, command capability/trust metadata (`commandCapabilities.ts`), per-area command modules (`registry.ts`, `keybindings.ts`, `coreCommands.ts`, `workbenchCommands.ts`, `explorerCommands.ts`, `editorCommands.ts`, `tabCommands.ts`).
- `src/lib/workbench/` — contribution registries for pluggable UI and providers (`activityBarRegistry.ts`, `sidebarRegistry.ts`, `bottomPanelRegistry.ts`, `statusBarRegistry.ts`, `statusBarContributions.ts`, `contextMenuRegistry.ts`, `menuRegistry.ts`, `previewRegistry.ts`, `scmRegistry.ts`, `taskRegistry.ts`, `snippetRegistry.ts`, `settingsRegistry.ts`, `editorGroupRegistry.ts`, `runRegistry.ts`, `walkthroughRegistry.ts`, `contributions.ts`).
- `src/lib/contrib/` — built-in feature contributions (explorer, search, scm, debug, terminal, editor) — each registers via workbench/platform registries.
- `src/lib/platform/` — IPC catalog (`ipc.ts`) and keybinding service (`keybindingService.ts`) — single source for Rust ↔ Svelte `invoke` contracts and keyboard dispatch.
- `src/lib/sdk/` — additional extension API surface (`types.ts`) — types only, no loader.
- `src/lib/utils/` — pure helpers: `path`, `replace`, `gitStatusStyles`, `treeFlattener`, `explorer`, `symbolEngine`, `languageDetector`, `markdownRender`, `stream`, `error`, `platform`, `cancelableLoader`, `runTargets`, `gitChangeTree`, `eventBus`.
- `src-tauri/src/` — Rust backend: `db.rs` (SQLite/rusqlite), `file_ops.rs`, `search.rs` (ripgrep `grep` crate), `watcher_service.rs` (notify), `workspace_cache.rs`, `git_service.rs`, `symbol_index.rs`, `ignore_rules.rs`, `startup.rs`, `discord.rs`.

See `ARCHITECTURE.md` for the modular layering and how to add features without hardcoding.

## Architecture & Modularity

Notron is modular by design. See `ARCHITECTURE.md` for the full layering.

- **Use registries, not hardcoding.** New commands → `src/lib/commands/registry.ts`; new keybindings → `src/lib/commands/keybindings.ts`; new views/panels/status items/menus/previews → `src/lib/workbench/` registries (`activityBarRegistry`, `sidebarRegistry`, `statusBarRegistry`, `menuRegistry`, `contextMenuRegistry`, `previewRegistry`); new file operations → `src/lib/services/fileService.ts` / `src/lib/platform/ipc.ts`; new notifications → `src/lib/services/notificationService.ts`. Do not add `if` chains or inline handlers in `App.svelte`, `FileTree.svelte`, or `Editor.svelte` — register declaratively.
- **Keep core / workbench / contrib separate.** Framework code in `platform`/`commands`/`workbench`, feature code in `contrib/<feature>/`. Built-in features register the same way additional extensions will.
- **Prefer services and the event bus.** Use `fileService`, `notificationService` and `eventBus` (`src/lib/utils/eventBus.ts`) instead of scattered `invoke('...')` strings or direct store cross-imports. All `request-open-file`, `request-workspace-switch`, `editor:action` go via `eventBus`.
- **One source of truth.** `constants/index.ts` for numbers, `languages.json` for language mapping, `platform/ipc.ts` for IPC, `themes/index.ts` for themes, `workbench/*Registry` for UI contributions.

## Conventions

- **Svelte 5 runes only** (`$state`, `$derived`, `$effect`, `$props`). No legacy `.subscribe()` in components, no `$:` labels.
- Component placement is by feature: `components/{common,editor,explorer,panels,shell}`. New shared components go in `common/`.
- Internal feature modules (icon themes, etc.) go in `extensions/` as self-contained sub-folders.
- Shared pure logic lives in `utils/`, **not** in a component's `<script module>` (e.g. git status styles were consolidated into `utils/`). Helpers must have exactly one source of truth.
- IPC: use the typed catalog in `src/lib/platform/ipc.ts` or `src/lib/services/fileService.ts` instead of raw `invoke('snake_case_command', {...})`. The matching Rust handler lives in `src-tauri/src/`. When changing an IPC command, update the catalog and both sides.
- Settings are scoped: `HARDCODED_DEFAULTS ← user (global) ← workspace` (see `stores/settings.svelte.ts`). Workspace overrides are surfaced in the Settings page with a "Workspace" badge and a reset-to-global action.
- Comments are English, concise, and focused on *why* (not *what*). Keep one style per purpose and never mix block/doc with inline on the same block.
  - **File header (first block in file):** one title + one-sentence description.
    - TypeScript / JS: `/**` block at the very top:
      ```ts
      /**
       * Title
       *
       * One-sentence description of the file's responsibility.
       */
      ```
    - Svelte markup: `<!-- -->` block at the very top because content outside
      `<script>` is parsed as markup:
      ```svelte
      <!--
       * Title
       *
       * One-sentence description of the file's responsibility.
      -->
      ```
    - Rust: `//!` inner-doc block at the very top (Rust equivalent of the `/**` header):
      ```rs
      //! Title
      //!
      //! One-sentence description of the module's responsibility.
      ```
  - **Exported API docs:** directly above the exported symbol, not at file top.
    - TS/Svelte: `/** Description. */`
    - Rust: `/// Description.` (or `//!` for module docs, `///` for item docs)
  - **Why-comments (inside bodies):** `//` only, one `//` per line even for multi-line explanations. Start with capital letter, end with period. No `/* ... */` or `/** ... */` inside bodies. Describe behavior in plain English for open-source readers; do not reference external products, editors, or internal spec codes.
  - **Section separators:** `// ── Section Name ──` (Rust) or `// Section Name` (TS) using `//` only. Use descriptive names, not codes.
  - **External references:** never mention external editors, products, or spec identifiers (`VS Code`, `VSCode`, `point`, `section #`, `D.2`, `B.5`, `#123`, etc.) in comments. Explain the *behavior* and *reason* directly so the comment is self-contained.
  - **Spacing:** one blank line after a file header and before a section separator; no extra `/**` and `//` stacked without code between them. No disclosure of additional references in comments.

## Guardrails

- Never commit secrets/API keys; never add `.env` files to the repo.
- Never leave `bun run check` failing — it is the repo's gate (0 errors AND 0 warnings).
- Check `utils/` before writing a new helper; check `constants/index.ts` before using a magic number.
- Don't "force" refactors: if a component can't be split cleanly (e.g. `FileTree.svelte`, `App.svelte` — single large closures over shared state), leave it alone.
- Don't reintroduce the old flat layout or old names (`TerminalPanel`, `FindReplacePanel`).
- Shell commands must be PowerShell-compatible (use `;` to chain, quote paths with spaces).
