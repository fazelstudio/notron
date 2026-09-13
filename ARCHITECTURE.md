# Architecture — Notron

This document describes the internal modular architecture of Notron. It is the reference for contributors and AI agents when adding or modifying features. For product goals, see `PRD.md`. For agent workflow, see `AGENTS.md`.

## Goals

- Keep the core small and stable.
- Make every user-visible feature pluggable via registries.
- Allow additional extensions to reuse the same mechanisms as built-in features.
- Avoid hardcoding; prefer declarative data.
- Keep comments and structure consistent across the codebase.

## Stack

- **Backend:** Tauri 2 + Rust
- **Frontend:** Svelte 5 (runes) + CodeMirror 6
- **Build:** Bun + Vite

## Layering

```
core (platform)
  └─ workbench (shell)
      └─ contrib (features)
```

- **core / platform** — framework code with no feature knowledge: command registry, keybinding registry, event bus, file service, IPC catalog, theme and language infrastructure.
- **workbench** — application shell that composes contributions: activity bar, sidebar, bottom panel, status bar, title menu, command palette, preview handling.
- **contrib** — self-contained features that register via platform/workbench: explorer, search, source control, debug/run, terminal, editor enhancements. Each lives under `src/lib/contrib/<feature>/`.

Internal features and additional additional extensions use the same registration path.

## Key Mechanisms

### 1. Command Registry

All actions are commands with a stable ID.

- **Location:** `src/lib/commands/registry.ts`
- **API:** `commandRegistry.register({ id, label, action })`, `commandRegistry.execute(id)`
- **Rules:** Never call a handler directly from UI. Register once, invoke by ID from palette, menu, keybinding, or other commands. Keep IDs stable (`workbench.action.*`, `editor.action.*`, `explorer.*`). Every tab, split, and preview toggle is a command.

### 2. Keybindings

- **Location:** `src/lib/commands/keybindings.ts`
- **API:** `DEFAULT_KEYBINDINGS` (data, references command IDs)
- **Rules:** Add a shortcut by adding one entry; do not edit the global keydown handler. Chord prefixes are supported. Dispatch is via `src/lib/platform/keybindingService.ts` which resolves to `commandRegistry`.

### 3. Workbench Contributions

Declarative data for pluggable containers.

- **Location:** `src/lib/workbench/` — `contributions.ts`, `activityBarRegistry.ts`, `sidebarRegistry.ts`, `bottomPanelRegistry.ts`, `statusBarRegistry.ts`, `contextMenuRegistry.ts`, `menuRegistry.ts`, `previewRegistry.ts`, `scmRegistry.ts`, `taskRegistry.ts`, `snippetRegistry.ts`, `settingsRegistry.ts`, `editorGroupRegistry.ts`, `runRegistry.ts`, `walkthroughRegistry.ts`
- **Concepts:** `ACTIVITY_BAR_ITEMS`, `SIDEBAR_VIEWS`, `BOTTOM_PANEL_ITEMS`, `StatusBarContribution`, `ContextMenuItem`, `PreviewContribution`, `ScmProvider`, `TaskProvider`, `SnippetContribution`, `SettingSchema`, `RunProvider`, `WalkthroughSection`
- **Rendering:** The shell renders `{#each ACTIVITY_BAR_ITEMS}` / `SIDEBAR_VIEWS` / `BOTTOM_PANEL_ITEMS`, the status bar, context menus, title menus (`ViewTitleMenu`), previews and the SCM view via loops. Adding a view, panel, menu, preview, provider, or onboarding step is one data entry.
- **Rules:** Do not hardcode a new button, panel, or preview check in markup. Register it.

### 3a. Menu Locations

Every menu location is its own container keyed by `menuId`, plus a separate context-menu registry:

- Menubar: `menubar/<name>` (e.g. `menubar/file`)
- View / Panel title ("..."): `view/<viewId>/title`, `panel/<panelId>/title`
- Editor title (top-right of a pane): `editor/title`
- Context menus: `contextMenuRegistry` with `editor/context`, `explorer/context`, `tab/context`, ...

Items are data (label, command id, group, order, `when`/`disabled`). Group changes insert the separator automatically. `ViewTitleMenu.svelte` renders any `menuId`.

### 3b. Command Capabilities (Trust Boundary)

- **Location:** `src/lib/commands/commandCapabilities.ts`, `commands/registry.ts`
- **API:** `commandRegistry.markCapability(id, level)`, `commandRegistry.setTrustGate(fn)`
- **Rules:** Sensitive commands (shell, filesystem, network) are declared in one list with a level (`trusted` / `dangerous`) instead of being audited later. The gate is unset by default; installing one is how workspace-trust enforcement is added.

### 4. Event Bus

Typed pub/sub for decoupled communication.

- **Location:** `src/lib/utils/eventBus.ts`
- **API:** `eventBus.on('request-open-file', handler)`, `eventBus.emit('request-open-file', payload)`
- **Rules:** Prefer the bus over direct store cross-imports or `window.dispatchEvent` literals. Keep `AppEvents` as the catalog. All `request-open-file`, `request-workspace-switch`, `editor:action` go via `eventBus`.

### 5. Services

Thin abstractions over Tauri IPC.

- **Location:** `src/lib/services/fileService.ts`, `src/lib/services/notificationService.ts`, `src/lib/platform/ipc.ts`
- **API:** `fileService.readText(path)`, `fileService.save(path, content)`, `notificationService.showMessage(msg)`, `fileIpc.*`
- **Rules:** UI code depends on the service interface, not on `invoke('string_literal')`. All `snake_case` IPC names are centralized in `platform/ipc.ts`.

### 5a. Run, Task and SCM Providers

- **Run:** `src/lib/workbench/runRegistry.ts` + `src/lib/services/run/runProviders.ts`. Each runtime is a provider (`types`, `build`) and `runService` dispatches by configuration type; adding a runtime is a registration.
- **Tasks:** `src/lib/workbench/taskRegistry.ts` + `src/lib/contrib/debug/taskProviders.ts`. Providers read the workspace (package.json, Cargo.toml, ...) and contribute runnable tasks; `runService` folds them into the Run list.
- **SCM:** `src/lib/workbench/scmRegistry.ts` + `src/lib/components/panels/ScmView.svelte`. The view is generic and renders registered providers; Git is one provider.
- **Services:** `dialogService` (`src/lib/services/dialogService.ts`) is the single entry point for quick pick, input box, progress and file dialogs; the dialogs themselves (`QuickPickDialog`, `InputBoxDialog`) are dumb views over `stores/dialog.ts`.

### 6. Editor Extensions

CodeMirror features are contributed, not mixed in one array.

- **Location:** `src/lib/editor/extensionRegistry.ts`, `languageRegistry.ts`, `src/lib/editor/commonExtensions.ts` (core)
- **API:** `editorExtensionRegistry.register({ id, create })`
- **Rules:** Core editing (history, brackets, keymaps) stays in `commonExtensions`. Optional features (minimap, git gutter, breadcrumbs, search highlight) register as extensions.

### 7. Preview System

File previews are pluggable.

- **Location:** `src/lib/workbench/previewRegistry.ts`
- **API:** `previewRegistry.register({ id, fileExtensions, getMode, setMode })`, `previewRegistry.getForFile(path, language)`
- **Rules:** Do not hardcode `path.endsWith('.md')` in the editor. Register a preview provider. Toggle via commands `workbench.action.preview.showCode/showPreview/showSplit`.

### 8. Tab and Split Management

All tab and split actions are commands.

- **Location:** `src/lib/commands/tabCommands.ts`, `src/lib/stores/split.ts`, `src/lib/stores/editor.ts`
- **API:** `workbench.action.closeActiveEditor`, `closeOtherEditors`, `splitEditorRight/Down/Left/Up`, `pinEditor`
- **Rules:** UI (tab context menu, pane empty menu) invokes via command id, not direct store calls. The registry is the integration point for additional layout extensions.

### 9. Themes and Languages

- **Themes:** `src/lib/themes/index.ts` (`THEMES` catalog, CSS variable injection). Icon selection is data-driven through `components/common/FileIcon.svelte`, which picks the renderer from `icon_theme` so callers never branch on theme ids.
- **Languages:** `src/lib/constants/languages.json` (single source) + `src/lib/utils/languageDetector.ts` (loaders) → published into `editor/languageRegistry.ts`, which is the lookup path used when a file is opened.
- **Snippets:** `src/lib/workbench/snippetRegistry.ts` (data per language) + `src/lib/editor/snippetCompletion.ts` (generic completion source). A snippet is one data entry.
- **Rules:** New theme or language is one entry in the catalog + one loader.

### 10. Settings

Central schema with scoped values (`HARDCODED_DEFAULTS ← user ← workspace`). See `src/lib/stores/settings.svelte.ts`. New settings are one entry in `AppSettings` and `HARDCODED_DEFAULTS`.

The Settings UI renders hand-written rows for the settings that need custom controls, then fills in any remaining schema entries automatically from `workbench/settingsRegistry.ts`. Registering a schema (key, type, default, title, description, category) is therefore enough for a setting to appear.

### 11. Walkthrough

- **Location:** `src/lib/workbench/walkthroughRegistry.ts`
- **Rules:** Onboarding is data (sections + steps with label, icon path and command). The Welcome page renders the registry, so a step is one entry.

## Directory Guide

```
src/lib/commands/          — command registry, keybindings, per-area command modules
src/lib/platform/          — IPC catalog (Rust ↔ Svelte contract), keybinding service
src/lib/workbench/         — contribution registries (activity bar, sidebar, bottom panel, status bar, menus, preview, SCM, task, snippet, settings, editor group, run, walkthrough)
src/lib/contrib/*          — feature modules (explorer, search, scm, debug, terminal, editor)
src/lib/services/          — service layer (git, runService, fileService, notificationService, dialogService)
src/lib/services/run/      — built-in run providers (one per runtime)
src/lib/editor/            — CodeMirror shared extensions and registries
src/lib/components/{common,editor,explorer,panels,shell} — UI (render registries, not hardcode)
src/lib/stores/            — runes stores (state)
src/lib/utils/             — pure helpers (single source)
src/lib/sdk/types.ts       — additional extension API surface (types only, no loader)
src/lib/themes/            — theme catalog
src/lib/constants/         — magic numbers and defaults
src-tauri/src/             — Rust backend
```

## How to Add a Feature (Without Hardcoding)

1. **Pick an ID** — e.g. `myFeature.doThing`
2. **Register a command** — `commandRegistry.register({ id: 'myFeature.doThing', label: 'Do Thing', action: doThing })`
3. **Contribute UI declaratively** — add an entry to the relevant registry:
   - Activity bar / sidebar: `activityBarRegistry.register(...)` / `sidebarRegistry.register(...)`
   - Bottom panel: `BOTTOM_PANEL_ITEMS` or `previewRegistry.register(...)` for file previews
   - Status bar: `statusBarRegistry.register(...)`
   - Context menu: `contextMenuRegistry.register({ contextId: 'explorer/context', command: 'myFeature.doThing' })`
   - Menubar: `menuRegistry.register({ menuId: 'menubar/file', command: 'myFeature.doThing' })`
   - View / Panel title menu: `menuRegistry.register({ menuId: 'view/explorer/title', command: 'myFeature.doThing' })`
   - SCM / task / run / snippet / setting / walkthrough step: register in `scmRegistry`, `taskRegistry`, `runProviderRegistry`, `snippetRegistry`, `settingsRegistry`, `walkthroughRegistry`
   - Keybinding: `DEFAULT_KEYBINDINGS` entry referencing the command ID
   - Notification: `notificationService.showMessage(...)` or `workbench.action.showInformationMessage`
4. **Use services** — call `fileService.*`, `notificationService.*`, `dialogService.*` or other service interfaces, not raw `invoke`.
5. **Emit via event bus** if cross-feature communication is needed.
6. **Declare sensitivity** — add the command id to `commands/commandCapabilities.ts` when it touches the filesystem, a shell, or the network.

If a new container is needed, add a registry for it; do not add a one-off `if` chain.

## Conventions for Contributors

- Use Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`).
- Keep comments in English, concise, and focused on *why*. Every file uses the same header format `/** * Title * * Description. */` and inline `//` for why-comments on every line, not only the first. No additional reference disclosure in comments.
- Check `src/lib/utils/` before adding a helper; check `src/lib/constants/` before adding a literal.
- Keep `bun run check` at 0 errors and 0 warnings.
- Use `eventBus` and `fileService`/`notificationService`/`platform/ipc` instead of scattered literals.

## Further Reading

- `AGENTS.md` — workflow and guardrails for automated agents
- `PRD.md` — product requirements
- `src/lib/sdk/types.ts` — additional extension API surface
