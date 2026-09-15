# notron-sdk

Public SDK for building Notron extensions — the analogue of the `vscode` module in VS Code. Provides manifest types, 14 API namespaces, a runtime host, checksum verification, and a CLI toolchain (`notron-sdk` / `ntrn`) for bundling extensions into `.ntrn`.

> Notron is a desktop code editor (Tauri 2 + Svelte 5 + CodeMirror 6). This SDK is the public surface for third-party extensions. Notron's core principle: **every feature → a `namespace.action` command + centralized `executeCommand(id)`** (`src/lib/commands/registry.ts:48`).

Design references: `docs/modules/NOTRON_SDK_00_INDEX.md` — `NOTRON_SDK_06_ROADMAP_PHASING.md`. Real implementations vs. typed stubs follow the `NOTRON_SDK_00_INDEX.md:2` rule (stubs throw a descriptive `NotImplementedError`, never silent).

---

## 1. Introduction

`notron-sdk` exposes a stable API for extension code — just like `import * as vscode from 'vscode'` in VS Code, in Notron:

```ts
import { commands, window, workspace } from 'notron-sdk';
import { ExtensionContext } from 'notron-sdk';
```

The host runtime (`ExtensionHost`, `ExtensionContext`, `NotronEventBus`, `Memento`, `SecretStorage`) is bridged to the Notron core via delegates (`setCommandDelegate` → `commandRegistry.execute`, `setWindowDelegate` → `statusBarRegistry`/`dialogService`, `setWorkspaceDelegate` → `fileService`/`settingsStore`). Outside Notron (tests / dev) the SDK runs standalone with in-memory fallbacks that still satisfy the type contracts.

`ExtensionHost` honors `activationEvents`: `activateAll()` only processes
startup extensions (`*` and `onStartupFinished`), while the host can call
`activateByEvent('onCommand:example.command')` for deferred activation.
Declarative contributions are registered before activation so the UI can
aggregate manifests without importing extension code directly.

The `discord` API is an optional host capability for presence extensions or
other activity integrations. Outside the desktop host it is safe to use because
the fallback returns `{ connected: false }` and activity operations become
no-ops.

The `src/lib/workbench/*Registry` split (activityBar, sidebar, bottomPanel, statusBar, menu, preview, scm, task, snippet, settings) keeps view/panel/menu containers registry-driven — extensions just declare in `manifest.json`, never touching the shell.

---

## 2. Installation

In an extension project (after `notron-sdk init` or manual setup):

```bash
npm install notron-sdk
# or
bun add notron-sdk
# or from GitHub Packages (same content, scoped name — install under the bare
# name via alias so `import from 'notron-sdk'` keeps working):
# npm install notron-sdk@npm:@fazelstudio/notron-sdk
# (requires .npmrc with @fazelstudio:registry=https://npm.pkg.github.com + token)
```

`notron-sdk` is a **peer dependency** — do not bundle it into `dist/extension.js`. The CLI marks it `external: ['notron-sdk']` (esbuild `bundle: true, platform: node, format: cjs`); the host provides the real implementation at runtime. For `notron-extension.config.ts` IntelliSense, import the helper:

```ts
import { defineConfig } from 'notron-sdk';
export default defineConfig({ external: ['react'], target: 'es2022' });
```

Dev prerequisites: `bun` (test runner), `typescript@~5.8`, `esbuild`, `adm-zip`.

---

## 3. Quick Start

Complete from `init` to `.ntrn` (validates `NOTRON_SDK_04_PACKAGE_CLI` §3 + `NOTRON_SDK_05_TESTING_DX` §4):

```bash
# 1) scaffold — hello-world template (full) available, 3 others are stubs (see Status)
npx notron-sdk init my-extension --template hello-world
cd my-extension
npm install   # package.json already depends on notron-sdk ^0.1.0

# 2) inspect the initial manifest (minimal valid)
cat manifest.json
# { "id": "acme.my-extension", "publisher": "acme", "version": "0.1.0",
#   "engines": { "notron": "^0.1.0" }, "main": "./dist/extension.js",
#   "activationEvents": ["onCommand:acme.helloWorld"], "contributes": { "commands": [...] } }

# 3) code — example src/extension.ts:
#    import * as notron from 'notron-sdk';
#    export function activate(ctx) {
#      ctx.subscriptions.push(
#        notron.commands.registerCommand('acme.helloWorld', async () => {
#          await notron.window.showInformationMessage('Hello from Notron!');
#        })
#      );
#    }

# 4) dev loop — dev bundle (no minify, with sourcemap)
npx notron-sdk build
# or watch:
npx notron-sdk build --watch   # esbuild.context().watch()

# 5) validate the manifest (checks engines semver, activationEvents, contributes files)
npx notron-sdk validate
# ✓ manifest valid: manifest.json
# npx notron-sdk validate ./manifest.json  # explicit path also works

# 6) package — prod build (minify, no sourcemap) + checksums + .ntrn ZIP
npx notron-sdk package
# → my-extension-0.1.0.ntrn (ZIP: manifest.json, dist/extension.js, README.md, checksums.json)
#   checksums.json: { "dist/extension.js": "sha256:...", "manifest.json": "sha256:..." }
#   verify: import { verifyChecksum } from 'notron-sdk/utils'

# 7) local install (dev only — see notes)
npx notron-sdk install-local my-extension-0.1.0.ntrn
# → ~/.notron/extensions-dev/acme.my-extension/
# Note: install-local is only for local inspection/testing. To install a package
# as a user, use Command Palette → Extensions: Install from .ntrn…

# 8) list other templates
npx notron-sdk list-templates
# hello-world, webview-view, language-support, custom-editor
```

Project structure generated by `init`:

```
my-extension/
├── manifest.json          # ExtensionManifest (id publisher.name, semver, contributes)
├── src/
│   └── extension.ts       # activate(ctx: ExtensionContext)/deactivate()
├── package.json           # depends on notron-sdk
├── tsconfig.json
├── .gitignore             # dist/, *.ntrn
└── README.md
```

---

## 4. Core Concepts

Brief; see the docs for full detail (`NOTRON_SDK_01_API_SURFACE.md`, `NOTRON_SDK_02_MANIFEST_TYPES.md`):

- **Extension** — third-party code packaged as `.ntrn` (ZIP), run via `activate(context: ExtensionContext): void|Promise<void>` / `deactivate?(): void|Promise<void>`. `context.subscriptions: Disposable[]` is cleaned up LIFO on deactivate (host `lifecycle.ts: dispose()` reverse loop, spec §1 step 7). `context.globalState` / `workspaceState` (`Memento`), `secrets` (`SecretStorage`), `logChannel` (`OutputChannel` per `Extension:<id>`), `extensionPath`/`extensionUri`.

- **Manifest** (`ExtensionManifest`) — identity `id: publisher.name` (regex `ID_REGEX`), `name`, `version` semver, `publisher`, `engines.notron` semver range (validated with `SEMVER_RANGE_LOOSE`), `main` (relative JS entry path), `activationEvents` (at least 1, `onCommand:`/`onLanguage:`/`onView:`/`onUri`/`onStartupFinished`/`workspaceContains:`/`onCustomEditor:`/`*` patterns), `contributes` (13 categories), `permissions` (7 enum values). Validated via `validateManifest()` / `validatePermissions()` / `validateActivationEvents()` in `src/utils/index.ts` (100% Phase 1, 78 tests in `test/manifest.test.ts`). JSON Schema available at `src/types/manifest.schema.json` (draft-07, used by `cli validate`).

- **Activation Event** — when the host activates the extension. At least one is required. `onCommand:` is most common for lazy activation, `onStartupFinished` for extensions needed immediately, `*` for always (avoid unless needed).

- **Contribution Point** — declarative in `contributes.*` (not an imperative API). 13 categories: `commands` (a `namespace.action` command + title), `menus` (13 `MenuLocation`: `commandPalette`, `editor/context`, `editor/title`, `explorer/context`, `view/title`, `view/item/context`, `tab/context`, `menubar/file`..`menubar/help`, `pane/context`), `keybindings`, `viewsContainers` (`activitybar`/`panel`), `views` (`Record<containerId, View[]>` of type `tree`|`webview`), `languages` (id + extensions), `grammars` (path to a CodeMirror 6/Lezer module, not TextMate), `themes`/`iconThemes`/`productIconThemes`, `snippets`, `configuration` (`title` + `properties`), `debuggers`, `taskDefinitions`. Read by host `src/host/contributions.ts:registerManifestContributions` before `activate()`, auto-disposed via `context.subscriptions`.

- **Disposable** — every `register*` returns `{ dispose() }`. Register into `context.subscriptions` for LIFO cleanup on deactivate. Helpers `toDisposable(fn)` and `combinedDisposable(...ds)` in `src/api/types.ts`. Error isolation: every `activate`/`deactivate`/handler/event listener is wrapped in `try/catch` → `ExtensionActivationError`/`ExtensionRuntimeError` (host `errors.ts:withErrorIsolation`); one failing extension never stops the host or other extensions (tested, 40 tests in `test/host.test.ts`).

---

## 5. API Reference

All 14 namespaces are covered (real or fully-typed stubs, none missing — Phase 4 complete). Types are documented via TSDoc in `src/api/*.ts`; the reference below is currently hand-written (not yet auto-generated with TypeDoc — follow-up recommendation). Import:

```ts
import { commands, window, workspace, views, menus, languages, theming, debug, tasks, scm, snippets, authentication, terminal, extensions } from 'notron-sdk';
// or namespaced: import * as notron from 'notron-sdk';
```

| Namespace | Status | Key signatures | Notes |
|---|---|---|---|
| `commands` (§1) | **Stable** | `registerCommand(id, handler): Disposable`, `executeCommand<T>(id, ...args): Promise<T\|undefined>`, `getCommands(filterInternal?): Promise<string[]>` | Bridged to `commandRegistry` (`src/lib/commands/registry.ts:48`) via `setCommandDelegate`; 87 known core IDs in `KNOWN_CORE_COMMANDS`; throws if the ID is already registered by another extension (except same-extension re-register); error isolation via `ExtensionRuntimeError` |
| `window` §2.1 notifications/dialogs | **Stable** | `showInformationMessage`/`showWarningMessage`/`showErrorMessage(msg, ...items): Promise<string\|undefined>`, `showQuickPick(items, opts)`, `showInputBox(opts)`, `withProgress(opts, task)` | Delegates to `notificationService`/`dialogService` (`QuickPickDialog`/`InputBoxDialog`) when available, otherwise an in-memory fallback queue + `__getShownMessages()` for tests |
| `window` §2.2 status bar | **Stable** | `createStatusBarItem(alignment?, priority?): StatusBarItem { text, tooltip, command, show/hide/dispose }` | Full CRUD; delegates to `statusBarRegistry.register` when available, otherwise `StatusBarItemImpl` + Map; `__getStatusBarItems()` |
| `window` §2.3 output | **Stable** | `createOutputChannel(name): OutputChannel { append/appendLine/clear/show/hide/dispose }` | String-buffer fallback; also backs `ExtensionContext.logChannel` and `ExtensionHost.hostLog` (`OUTPUT_CATEGORIES: Extension Host`) |
| `window` §2.4 tabGroups | **Stable** | `tabGroups.all/activeTab/openTab(uri, {viewColumn,preview})`, `tab.close/pin/move`, `onDidChangeActiveTab/onDidChangeTabGroups`, `activeTextEditor/visibleTextEditors/onDidChangeActiveTextEditor` | Fallback `TabGroup[]` store + `Emitter`; delegates to `splitStore`/`editorStore` when available; `__setActiveTextEditor`/`__setTabGroups` for bridging |
| `window` §2.5 custom editor | **Stub** | `registerCustomEditorProvider(viewType, provider): Disposable`, `openEditorToSide(uri, viewType?)` | `throw NotImplementedError` — core only has hardcoded `MarkdownPreview`/`ImageViewer`/`DiffEditor` (`previewRegistry.ts:14`, 2 providers for .md/.svg) + `SplitView`; no generic registry + CSP isolation yet (Limitation #4) |
| `window` §2.6 webview | **Stub** | `createWebviewPanel(viewType, title, showOptions, options): WebviewPanel`, `registerWebviewViewProvider(viewId, provider): Disposable` (window) | `throw NotImplementedError` — no webview/CSP host yet; `views.registerWebviewViewProvider` (views namespace) is **Stable** as an alternative (delegates to `sidebarRegistry`) |
| `workspace` §3.1 folders | **Stable** | `workspaceFolders: WorkspaceFolder[]\|undefined`, `onDidChangeWorkspaceFolders` | Bridges `eventBus 'request-workspace-switch'` → `__setWorkspaceFolders` |
| `workspace` §3.2 documents | **Stable** | `onDidOpenTextDocument`/`onDidCloseTextDocument`/`onDidSaveTextDocument`/`onDidChangeTextDocument: Event<TextDocument>` | Via `Emitter` + `__fireDidOpen/Close/Save/Change` helpers; host bridges `eventBus 'request-open-file'`/`split:request-close-tab`/`editor:action` + CodeMirror `updateListener` → `editor:sync-content` |
| `workspace` §3.3 fs | **Stable** | `fs.readFile/writeFile/readDirectory/createDirectory/delete/rename/stat(uri): Promise<...>` | Dual: delegates to `fileService`/`fileIpc` (`invoke('read_file_text', ...)`) when available, otherwise an in-memory tree `Map` fallback (full CRUD + `onFileSystemChange` from mutations / Tauri `fs-change` `watcher_service.rs:346`) |
| `workspace` §3.4 config | **Stable** | `getConfiguration(section?): WorkspaceConfiguration { get/has/update }`, `registerConfiguration(...)`, `onDidChangeConfiguration: Event<ConfigurationChangeEvent>` | Runtime schema contributions are delegated to the host settings registry; values still use the normal global/workspace configuration path |
| `workspace` §3.5 fs provider | **Stub** | `registerFileSystemProvider(scheme, provider): Disposable` | Low priority (§3.5), `throw NotImplementedError` — core only has the local `TauriFileService` |
| `views` §5 | **Stable** | `getContainer(id)/getContainers()/getView(id)/getViews(containerId?)`, `registerTreeDataProvider<T>(viewId, provider)`, `registerWebviewViewProvider(viewId, provider)`, `onDidChangeViews` | In-memory `containers/viewsMap/treeProviders/webviewProviders` + delegates to `activityBarRegistry`/`sidebarRegistry`; declarative `contributes.viewsContainers/views` via host `contributions.ts` |
| `menus` §6 | **Stable** | `evaluateWhenClause(expr, ctx): boolean`, `getMenus(location, ctx): MenuEntry[]` + 13 `MenuLocation` | Full parser (tokenizer + recursive-descent: `&&`/`||`/`!`/`==`/`!=`/`=~`/`>`/`<`/`in` + `()` + quoted/unquoted `.js` literal + regex `/.../flags`); declarative `contributes.menus` via host |
| `languages` §4 (completion/hover/definition/formatting) | **Stub (high priority)** | `registerCompletionItemProvider(selector, provider, ...triggerChars)`, `registerHoverProvider`, `registerDefinitionProvider`, `registerDocumentFormattingEditProvider` | Per-language highlighting is **already modular** (80+ languages, `languageDetector.ts:LANG_LOADERS` + per-language `languageRegistry` + lazy `Editor.svelte:langCompartment`) — the only gap is dynamic runtime providers (needs an `editorExtensionRegistry`/`Compartment` bridge into CodeMirror; the SDK stores them in-memory + `warnStubOnce`, host not wired yet) |
| `languages` diagnostics/config | **Stable** | `createDiagnosticCollection(name?): DiagnosticCollection { set/get/has/delete/clear/forEach/dispose }`, `setLanguageConfiguration(languageId, config)`, `matchesSelector` | Full in-memory CRUD (`DiagnosticCollectionImpl` + `Emitter`); declarative `languages`/`grammars` via host |
| `theming` §7 | **Stable** | `getActiveColorTheme(): ColorTheme {kind:'light'|'dark', id}`, `onDidChangeActiveColorTheme`, `getContributedThemes()`, `getContributedIconThemes()` | Fallback `activeTheme` + `themeEmitter`; declarative `contributes.themes/iconThemes/productIconThemes` via host (path not dynamic-imported yet) |
| `activity` | **Optional** | `init()`, `setActivity(...)`, `clear()` | Generic host capability; legacy `discord` namespace aliases this API |
| `debug` §8 | **Stub (low priority)** | `registerDebugAdapterDescriptorFactory(debugType, factory)`, `startDebugging(folder, config): Promise<boolean>`, `onDidStart/TerminateDebugSession` | Declarative `contributes.debuggers` is real data-only; `startDebugging` throws `NotImplementedError` — core has no DAP host yet (only `runService`/`runProviderRegistry` run without debugging; `grep DAP` 0 hits) |
| `tasks` §9 | **Stable (partial)** | `registerTaskProvider(type, provider)`, `executeTask(task): Promise<TaskExecution>`, `fetchTasks(filter?)`, `onDidStart/EndTask`, `ShellExecution/ProcessExecution/CustomExecution` | Delegates to `taskRegistry.register` (`npm`/`cargo` in `contrib/debug/taskProviders.ts`) when available, otherwise in-memory fallback; `executeTask` fallback emits `onDidStartTask` → `queueMicrotask` → `onDidEndTask` without a real shell (hybrid) |
| `scm` §10 | **Stable (partial)** | `createSourceControl(id,label,rootUri?): SourceControl { createResourceGroup/ inputBox/count}`, `getSourceControls()`, `onDidChangeSelectedSourceControl` | Delegates to the generic `scmRegistry.register` (`git` provider in `SourceControlPanel`) when available, otherwise the `SourceControlImpl` fallback with full CRUD (groups + `resourceStates` setter + `inputBox`); core `scmRegistry` is already generic |
| `snippets` §11 | **Stable (declarative)** | `getSnippetsForLanguage(lang): Snippet[]`, `getAllSnippetContributions()`, `registerSnippets(lang, snippets)`, `validateSnippet(obj)` | Declarative `contributes.snippets` is real → `snippetRegistry` (`getForLanguage`, 6 languages) + `snippetCompletion.ts` CodeMirror `languageData`; imperative `SnippetString` is not exposed (very low priority) |
| `authentication` §12 | **Stub (very low)** | `registerAuthenticationProvider(id,label,provider)`, `getSession(providerId, scopes, opts): Promise<AuthenticationSession\|undefined>`, `onDidChangeSessions` | In-memory `providers` Map + `warnStubOnce`; `getSession` throws `NotImplementedError` — core has no auth service |
| `terminal` §13 | **Stable** | `createTerminal(options?): Terminal { sendText/show/hide/dispose, processId, exitStatus }`, `registerTerminalProfileProvider`, `registerTerminalLinkProvider`, `onDidOpen/CloseTerminal` | Delegates to `terminalStore.newTerminal` + `tauri-pty` (`TerminalInstance.svelte` spawn + xterm FitAddon + 6 `terminalCommands`) when available, otherwise the `TerminalImpl` fallback with full CRUD (buffer, `sendText`, `show/hide`, `__getTerminals`) |
| `extensions` §14 | **Stable** | `getExtension(id): ExtensionInfo\|undefined`, `all: ExtensionInfo[]`, `onDidChange: Event<void>` | Via `ExtensionHost.allExtensions/getExtension` + fallback `localExtensions` Map (`ExtensionInfo {id, version, publisher, isActive, exports, packageJSON}`) |

Host runtime (`NOTRON_SDK_03_HOST_RUNTIME`): `ExtensionContext` (globalState/workspaceState `Memento` + `SecretStorage` in-memory warnOnce + `logChannel`), `NotronEventBus` (`emit/on/onTyped/clear/count`, 15 `SDK_EVENTS`, `bridgeExternalEvent`), `ExtensionHost` (`topologicalSort` + cycle/missing + `isCompatible` lenient semver `^`/`~`/`>=` + `register`→`activateAll` isolate + `deactivateAll` LIFO), `registerManifestContributions` (7 categories). Error isolation at every entry point.

> For the event & command mapping table to the real core, see `IMPLEMENTATION_LOG.md` Phase 2 (final) + Phase 0 inventory of 87 commands.

---

## 6. CLI Reference

Binary: `notron-sdk` (alias `ntrn`) via `package.json:bin` → `dist/cli/bin.js` (`#!/usr/bin/env node`, `runCli(argv)`).

### `notron-sdk init [name] [--template <name>]`

Scaffolds a new project. Templates:

| Name | Status | Contents |
|---|---|---|
| `hello-world` | **Full** | `manifest.json` `acme.hello-world`, `src/extension.ts` `import * as notron from 'notron-sdk'` + `registerCommand hello-world.hello` (activate: `globalState.helloCount` + `getConfiguration(theme)` + `OutputChannel` + `StatusBarItem` + document/config/tab events), `package.json` (`notron-sdk ^0.1.0`), `tsconfig.json`, `.gitignore` (dist, *.ntrn), `README.md` |
| `webview-view` | **Stub** | minimal webview `viewsContainers` + `views` manifest + placeholder `src/extension.ts` + `stub` README |
| `language-support` | **Stub** | `.my` `languages` + `grammars` manifest + placeholder |
| `custom-editor` | **Stub** | `customEditors` manifest placeholder + placeholder |

`src/cli/templates/hello-world/` is copied via `getTemplatesDir()` (dist + src fallback) → `copyTemplateDir` (`gitignore` → `.gitignore`) → patches `manifest.json`/`package.json`/`src/extension.ts`, replacing `hello-world` with `<sanitized>`.

```
my-extension/
├── manifest.json
├── src/extension.ts
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

### `notron-sdk build [--watch]`

Bundles via **esbuild** (`src/extension.ts` → `manifest.main`, default `dist/extension.js`):

- `format: cjs` (CommonJS) — the host loads it via dynamic-import interop. `esm` via `format: 'esm'` in `notron-extension.config.ts`.
- `platform: node`, `target: es2020` (overridable via config), `external: ['notron-sdk', ...config.external]`.
- **build** (default): `minify: false`, `sourcemap: true` (dev, `sourcesContent:false`, logLevel info).
- `--watch`: `esbuild.context().watch()` rebuilds automatically, keeps the process alive.

Overridable via `notron-extension.config.{ts,js,mjs,cjs,json}` (`NotronExtensionConfig` in `src/types/index.ts:284`: `entry`, `outfile`, `external`, `target`, `format`, `minify`, `sourcemap`, `esbuildOptions`).

### `notron-sdk package`

1. Validates the manifest (fail-fast, `validateManifestWithFiles`).
2. Production build: `minify: true`, `sourcemap: false` (removes stale `.map`).
3. Collects: `manifest.json`, `dist/extension.js` (from `manifest.main`), `README.md`/`CHANGELOG.md` if present, `contributes.*` files (`languages.configuration`, `grammars.path`, `themes.path`, `snippets.path`, `debuggers.program`, `icon` + recursive `assets/`).
4. Computes `checksums.json`: `{ "dist/extension.js": "sha256:...", ... }` SHA-256 per file (excluding itself) via `computeChecksumSync` (pure-JS FIPS 180-4 fallback + async Web Crypto).
5. ZIPs to `<name>-<version>.ntrn` in the project root (`AdmZip`).

Fails on an invalid manifest — never produces an `.ntrn` from an invalid manifest (exit 1).

### `notron-sdk validate [path]`

Validates `manifest.json` against the schema (Phase 1 `validateManifest` + §5.1 `manifest.schema.json`) + checks that referenced `contributes.*` files actually exist. Human-readable `path: message` output with `✖`/`✓`. Programmatic `validateCommand(manifestArg, { cwd, manifestPath }) → { valid, errors, manifestPath }`.

```
[notron-sdk] ✖ manifest invalid: manifest.json
  ✖ id: must match publisher.name ...
  ✖ contributes.grammars[0].path: file not found: "./missing.json"
```

### `notron-sdk install-local <path.ntrn>`

Extracts the `.ntrn` to `~/.notron/extensions-dev/<extensionId>/` (dev convenience).
For user installs, use the Notron Command Palette: `Extensions: Install from
.ntrn…`. Core validates the manifest, rejects ZIP path traversal, stores the package in
application data, rediscovers packages on startup/workspace switch, and
activates the bundled CommonJS entry through `notron-sdk`.

The desktop runtime only provides `notron-sdk` to installed entry points. Native
Node modules, arbitrary `require`, and ESM imports needing an external resolver
are not supported yet because the webview bundle is produced by Vite.

### `notron-sdk list-templates`

Prints `hello-world`, `webview-view`, `language-support`, `custom-editor`.

### `notron-extension.config.ts` (optional)

```ts
import { defineConfig } from 'notron-sdk';
export default defineConfig({
  entry: 'src/extension.ts',
  outfile: 'dist/extension.js',
  external: ['react'],
  target: 'es2022',
  format: 'cjs', // or 'esm'
  minify: false,
  sourcemap: true,
  esbuildOptions: { /* raw esbuild.BuildOptions */ }
});
```

The `NotronExtensionConfig` type is exported for IntelliSense.

---

## 7. Implementation Status

Honest, taken from append-only `IMPLEMENTATION_LOG.md` Phases 0–5. The table stays consistent with the Phase 7 final report below. **Stable** = real implementation + bridgeable fallback + tested; **Stub** = final signature + `NotImplementedError`/`warnStubOnce` + core-gap reason; **Deprecated** = none (0).

| Namespace / Area | Status | Honest notes (log source) |
|---|---|---|
| **types** `ExtensionManifest` / `ActivationEvent` / `ExtensionPermission` / 13 `ExtensionContributes` | **Stable** | Phase 1: full interfaces + 13 sub-types + 13 `MenuLocation` values (superset of the 7 in the spec, aligned with `menuRegistry.ts:11` menubar/pane) + `ValidationResult`; `manifest.schema.json` draft-07; `validateManifest`/`validatePermissions`/`validateActivationEvents`, 78 tests |
| **utils** `joinUri`/`isString` + `validate*` + `computeChecksum`/`verifyChecksum` | **Stable** | Phase 1 validation + Phase 5 sync pure-JS SHA-256 checksums (`hello → sha256:2cf24dba...` vector + tamper detection) + `generateChecksums`; `NotronExtensionConfig`/`defineConfig`/`Checksums` |
| `commands` | **Stable** | Phase 2: local registry + 87 deduplicated `KNOWN_CORE_COMMANDS` IDs + `setCommandDelegate` → `commandRegistry.execute`/`getCommands`; `getCommands` merges deduplicated + `filterInternal`; `ExtensionRuntimeError` error isolation |
| `window` notifications/dialogs/progress | **Stable** | `showInformation/Warning/ErrorMessage` → `windowDelegate.show*Message` otherwise queue + `__getShownMessages`; `showQuickPick`/`showInputBox` → `dialogService` otherwise `undefined`; `withProgress` → `dialogService.withProgress` otherwise no-op |
| `window` status bar | **Stable** | Full `createStatusBarItem` CRUD → `statusBarRegistry.register` otherwise `StatusBarItemImpl` Map |
| `window` output channel | **Stable** | `createOutputChannel` string buffer + `__getOutputChannelText` |
| `window` tabGroups/editor | **Stable** | `tabGroups.openTab/close/pin/move` + `activeTextEditor/visibleTextEditors/onDidChangeActiveTextEditor` fallback store; `__setActiveTextEditor` for bridging |
| `window` custom editor/webview | **Stub** | Phases 2+3: `throw NotImplementedError('window.registerCustomEditorProvider'/'createWebviewPanel'/'registerWebviewViewProvider')` — core only has 2 hardcoded previews (`previewRegistry.ts:14`) + `SplitView`, no generics + CSP yet (Limitation #4) |
| `workspace` fs | **Stable** | Phase 2: `fs.readFile/writeFile/readDirectory/createDirectory/delete/rename/stat` dual-delegate `fileService`/`fileIpc` → Tauri `invoke('read_file_text',...)` otherwise in-memory tree Map + `onFileSystemChange` from mutations / `watcher_service.rs:346 fs-change` |
| `workspace` configuration | **Stable** | `getConfiguration(section?).get/has/update` + `onDidChangeConfiguration` `affectsConfiguration` dual-delegate `settingsStore`/`settingsIpc` → `db.rs:577` otherwise `configStore` + `configEmitter` |
| `workspace` document/workspace events | **Stable** | `onDidOpen/Close/Save/ChangeTextDocument` + `onDidChangeWorkspaceFolders` + `onFileSystemChange` via `Emitter` + `__fire*` helpers; `eventBus` + `fs-change` bridge |
| `workspace` registerFileSystemProvider | **Stub** | Low priority (§3.5) — `throw NotImplementedError`, core only has the local `TauriFileService` |
| `views` | **Stable** | Phase 3: `ViewContainer`/`View` CRUD + real `TreeDataProvider`/`WebviewViewProvider` + delegate to `activityBarRegistry`/`sidebarRegistry`; declarative `viewsContainers`/`views` via host |
| `menus` | **Stable** | Phase 3: 13 `MenuLocation` + full `evaluateWhenClause` parser (tokenizer `STRING`/`IDENT` `&&`/`||`/`!`/`==`/`!=`/`=~`/`>`/`<`/`in` + recursive-descent + regex `/.../flags` stripping + truthiness + `getMenus` filter `when`) + `menuContributions` Map |
| `languages` providers (completion/hover/definition/formatting) | **Stub (high priority)** | Phase 3: highlighting is **already modular** (80+ languages, `languageDetector.ts:LANG_LOADERS` + per-language `languageRegistry` + lazy `Editor.svelte:langCompartment`) — the only gap is dynamic providers: `registerCompletionItemProvider` etc. stored in-memory + `warnStubOnce`, needs an `editorExtensionRegistry`/`Compartment` bridge (see IMPLEMENTATION_LOG Phase 3 "Not yet modular for dynamic providers") |
| `languages` diagnostics/config | **Stable** | Real `createDiagnosticCollection` CRUD (`DiagnosticCollectionImpl` + `Emitter`), real `setLanguageConfiguration`, `matchesSelector`, declarative `languages`/`grammars` |
| `theming` | **Stable** | Phase 3: `getActiveColorTheme`/`onDidChangeActiveColorTheme` fallback + delegate to 51 `THEMES`; declarative `themes`/`iconThemes`/`productIconThemes` via host (path not dynamic-imported yet) |
| `debug` | **Stub (low priority)** | Phase 4: final `DebugConfiguration/Session/DescriptorFactory` types; `registerDebugAdapterDescriptorFactory` stores in-memory + `warnStubOnce`; `startDebugging` throws `NotImplementedError` (core has no DAP, only `runService`) |
| `tasks` | **Stable (partial)** | Phase 4: `registerTaskProvider` → `taskRegistry.register` (`npm`/`cargo`) real when delegated, otherwise in-memory; `executeTask` hybrid fallback (`onDidStartTask` → `queueMicrotask` → `onDidEndTask` without a shell); bridgeable `TasksDelegate` |
| `scm` | **Stable (partial)** | Phase 4: real `createSourceControl` CRUD (`SourceControlImpl` + `ResourceGroupImpl` inputBox + `resourceStates` setter + `dispose` LIFO) → generic `scmRegistry` (`git`); host wiring to `SourceControlPanel` is a small gap |
| `snippets` | **Stable (declarative)** | Phase 4: real declarative `contributes.snippets` → data-driven `snippetRegistry` (6 languages) + `snippetCompletion.ts` `languageData`; real `registerSnippets` helper + `validateSnippet` |
| `authentication` | **Stub (very low)** | Phase 4: `registerAuthenticationProvider` in-memory + `warnStubOnce`; `getSession` throws `NotImplementedError` — core has no auth service |
| `terminal` | **Stable** | Phase 4: `createTerminal` → `terminalStore.newTerminal` + `tauri-pty` (`TerminalInstance.svelte` spawn) real when delegated, otherwise full-CRUD `TerminalImpl` (buffer, `sendText`, `show/hide`, `__getTerminals`); `onDidOpen/CloseTerminal` + profile/link providers |
| `extensions` | **Stable** | Phase 4: `getExtension`/`all`/`onDidChange` via `ExtensionHost` + fallback `localExtensions` Map |
| `host` `ExtensionContext`/`Memento`/`SecretStorage`/`NotronEventBus`/`ExtensionHost` | **Stable** | Phases 2+3: context `globalState/workspaceState: Memento` (CRUD + optional file-backed `MementoPersistence`) + in-memory `SecretStorage` warnOnce + `OutputChannel`; `NotronEventBus` with 15 `SDK_EVENTS` + `bridgeExternalEvent`; `ExtensionHost` lifecycle sort + isolate + LIFO dispose |
| **CLI** `init`/`build`/`package`/`validate`/`install-local`/`list-templates` | **Stable** | Phase 5: esbuild `build`/`package`, 6 commands via `runCli(argv)`, `validate` + file refs, `checksums.json` SHA-256, `bin: notron-sdk/ntrn`, `files: ["dist","src/cli/templates","src/types/manifest.schema.json"]`, `tsconfig emitDeclarationOnly:false` |
| **CLI templates** `hello-world` | **Stable** | Phase 5: full, e2e-tested `init → build → package` (dist 2KB dev / 960B prod, .ntrn 4 files, checksums verified + tamper detection) |
| **CLI templates** `webview-view`/`language-support`/`custom-editor` | **Stub** | Phase 5: stub folders (minimal valid manifest + placeholder `src/extension.ts` + `stub` README) — same core gaps (webview/language providers) |
| **Package** `signature` | **Placeholder** | Phase 5: `signature?: string` field not implemented (reserved for `minisign`/`cosign` code signing, follow-up recommendation) |
| **`notron-sdk/testing` (Mock Host)** | **Stable** | Phase 6: in-memory `createMockNotron()` + `createMockContext()` + `resetAllMocks()` for **all 14 namespaces** (stubs may be simple — stubs still throw a clear `NotImplementedError`); introspection `__getShownMessages`, `__getRegisteredCommands`, `__getStatusBarItems`, `__getSourceControls`, etc.; used internally for some unit tests (`NOTRON_SDK_05_TESTING_DX §2`) |

**Deprecated: none.** All stable APIs are additive; stubs will become stable as core provides bridges (see Priority Gaps in `IMPLEMENTATION_LOG.md` Phases 0–5).

---

## 8. Testing & Developer Experience

### Testing the SDK itself

`test/` uses `bun:test` (isolated via `bun test`, not `jest`):

- `test/utils.test.ts` (1) — `joinUri`
- `test/manifest.test.ts` (78) — `validateManifest`/`validatePermissions`/`validateActivationEvents` valid & invalid (semver, duplicate, path)
- `test/host.test.ts` (40) — `topologicalSort`/`isCompatible`, `ExtensionHost` lifecycle + error isolation (one failing extension does not stop the others, circular/missing), `Memento`/`SecretStorage`, `NotronEventBus`, `commands`/`window`/`workspace` (fs/config/document events) + hello-world smoke via `ExtensionHost`
- `test/fase3.test.ts` (19) — `views`/`menus` (`evaluateWhenClause` 5 cases + `getMenus` filter) / `languages` (providers stub + `DiagnosticCollection` + `setLanguageConfiguration` + declarative) / `theming` + `examples/sidebar-counter` & `markdown-preview` smoke
- `test/fase4.test.ts` (28) — `debug` (declarative + factory + throw + events), `tasks` (provider + async fallback execute + fetch), `scm` (createSourceControl CRUD + inputBox + duplicate throw + selected event), `snippets` (declarative + imperative case-insensitive + validate), `authentication` (register + throw + event), `terminal` (create + sendText + events + profile/link), `extensions` + 14-namespace re-export + Phase 4 host contributions
- `test/fase5.test.ts` (16) — `computeChecksumSync` vector `hello → sha256:2cf24dba...` + async `verifyChecksum` + `generateChecksums`, `validate` file refs missing/ok, `list-templates`/`init` hello-world valid & unknown throw, `init→build→package` flow (dist/extension.js exists, `.ntrn` 4 files without `.map`, `checksums.json` 3 entries verified + tamper detection) for the `hello-world` template and `examples/hello-world`, `package` fails on invalid (no .ntrn), `install-local` extracts to `tmpDev` + `validate` negative 8 errors
- `test/testing.test.ts` (Phase 6, +34) — Mock Host `createMockNotron`/`createMockContext` for **all 14 namespaces**: commands register/execute/isolate, window notifications/status/output/tabs/custom-editor stub throw, workspace fs/config/document/provider stub, views/menus/languages/theming/debug stub/tasks/scm/snippets/authentication/terminal/extensions + reset + integration spec example `myExtension.activate` → `executeCommand` → `__getShownMessages` + hello-world smoke via mock

Total **216 pass, 0 fail, 542 expect()** (7 files). Due to the read-only core constraint, no test runs the real Notron — SDK standalone only (follow-up recommendation: e2e with a running Notron).

### Testing utilities for extension authors — `notron-sdk/testing`

Separate sub-entry (`package.json:exports "./testing"` → `dist/testing/*`, `tsconfig paths: notron-sdk/testing`):

```ts
import { createMockNotron, createMockContext } from 'notron-sdk/testing';
// or relative during SDK dev: import { createMockNotron } from '../src/testing/index.js';

const notron = createMockNotron(); // in-memory 14 namespaces + __ helpers
const ctx = createMockContext('acme.demo');

await myExtension.activate(ctx as never);
await notron.commands.executeCommand('acme.demo.sayHello');
expect(notron.window.__getShownMessages().some(m => m.message === 'Hello!')).toBe(true);

// other introspection:
notron.commands.__getRegisteredCommands(); // alias __getRegisteredIds
notron.window.__getStatusBarItems();
notron.workspace.__getFsEntries();
notron.views.__getViewContainers();
notron.languages.__getDeclaredLanguages();
notron.terminal.__getTerminals();
notron.scm.__getSourceControls();

// reset between tests:
notron.__resetAll(); // or resetAllMocks()
ctx.dispose(); // LIFO subscriptions
```

Also used internally by the SDK for some of the unit tests above.

### Lint & Type Checking

- `tsconfig.json` full `strict: true` (`noImplicitAny`, `strictNullChecks`, `noUnusedLocals/Params`, `isolatedModules`, `emitDeclarationOnly: false` (JS needed for the CLI bin), `declarationMap`).
- Lint: `ESLint 8.57` + `@typescript-eslint/parser` 6.21 + `plugin` 6.21, config `.eslintrc.cjs` (`eslint:recommended` + `typescript-eslint/recommended`, `no-console` off, `prefer-const` warn, ignore `dist`/`templates`). Script `bun run lint` (`eslint src test --ext .ts`) — **must be 0 errors** (warnings allowed, but currently 0 warnings after the `prefer-const`/`no-constant-condition` fix).
- Scripts: `typecheck` (`tsc --noEmit`), `lint` (`eslint src test --ext .ts`), `test` (`bun test`), `build` (`tsc → dist + .d.ts + .js` (CLI bin)). All must pass before a phase counts as done (Phase 6 exit criteria).

### Reference extension examples (`packages/notron-sdk/examples/`)

Located in `packages/notron-sdk/examples/` (not the monorepo-root `examples/` — constrained to write **ONLY inside `packages/notron-sdk`** per the task instructions; no root `examples/` was created to respect read-only). They double as living documentation + manual smoke tests (run via `ExtensionHost` in tests):

- `examples/hello-world/` — a single `acme.helloWorld` command → `showInformationMessage` + `workspace.fs.writeFile/readFile` + `tabGroups.openTab` + `OutputChannel` + `StatusBarItem` + `globalState` + events. Builds a valid `.ntrn` with `notron-sdk build/package` (tested in Phase 5).
- `examples/markdown-preview/` — a simple custom editor/preview (exercises `languages` + `menus` + `theming` + the `window.registerCustomEditorProvider`/`createWebviewPanel` stubs → `OutputChannel` fallback). Manifest `onLanguage:markdown`, `menus.editor/title` `when: editorTextFocus && resourceExtname == .md`, `languages` `markdown-preview-demo`, `grammars`, `themes` `acme.preview-dark`, `configuration`.
- `examples/sidebar-counter/` — a sidebar Webview View with simple state (exercises `views` + `Memento` + `menus`). Manifest `viewsContainers: acme.counterContainer`, `views: acme.sidebarCounterView` (webview) + `acme.counterTree` (tree), `TreeDataProvider` `Counter: N` + `WebviewViewProvider` `increment`/`reset` via `postMessage` + `globalState.counter`.

Each example has a short `README.md` explaining the demonstrated APIs.

---

## 9. Contributing

```bash
bun install
bun run typecheck   # tsc --noEmit, must be 0 errors
bun run lint        # eslint src test --ext .ts, must be 0 errors
bun test            # bun:test, 216 pass
bun run build       # tsc → dist + .d.ts + .js (CLI bin)
```

Adding a new CLI template: add a `src/cli/templates/<name>/` folder containing a `manifest.json` (minimal valid, `publisher.name` id, validated by `validateManifest`), `src/extension.ts` (exports `activate`/`deactivate`), `package.json` (`notron-sdk ^0.1.0`), `tsconfig.json`, `gitignore` → `.gitignore`, `README.md`. Register in `getTemplatesDir`/`listTemplatesSync` (automatic via `fs.readdir`). Non-`hello-world` templates may be stubs, noted in `IMPLEMENTATION_LOG.md`.

Versioning: the SDK follows its own semver, separate from the Notron app (`CHANGELOG.md`), but each extension's `engines.notron` declares Notron compatibility.

---

## License

MIT
