# Changelog — notron-sdk

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/) and versioning is semver, separate from the Notron app (each extension's `engines.notron` declares compatibility).

## [0.1.0] — 2026-09-12 — Initial release

Initial `notron-sdk` release (Phases 0–6) — full 14-namespace API surface (real or typed stubs), the `.ntrn` toolchain, and the `notron-sdk/testing` Mock Host. No prior versions; this is the baseline for `NOTRON_SDK_06_ROADMAP_PHASING.md` Phase 7 (Final Report).

### Added

- **types & manifest** (`src/types/index.ts:1`, `src/utils/index.ts:1`): `ExtensionManifest` (`publisher.name` id, semver, `engines.notron` range, 7-value `permissions`, 8-variant `activationEvents`), 13 `ExtensionContributes` (commands, menus with 13 `MenuLocation`, keybindings, viewsContainers, views, languages, grammars (CodeMirror 6/Lezer, not TextMate), themes/iconThemes/productIconThemes, snippets, configuration, debuggers, taskDefinitions), `ValidationResult`, `NotronExtensionConfig`/`defineConfig`/`Checksums`, `manifest.schema.json` (draft-07, 78 tests in `test/manifest.test.ts`).
- **utils**: `validateManifest`/`validatePermissions`/`validateActivationEvents`/`isValidActivationEvent`, `computeChecksumSync`/`computeChecksum`/`verifyChecksum`/`verifyChecksumSync`/`generateChecksums` (sync pure-JS SHA-256 FIPS 180-4 + async Web Crypto), `hello → sha256:2cf24dba...` vector, tamper detection.
- **api: commands** (`src/api/commands.ts:1`): `registerCommand`/`executeCommand`/`getCommands` (merged 87 deduplicated `KNOWN_CORE_COMMANDS` + extension registry + `setCommandDelegate` → `commandRegistry`).
- **api: window** (`src/api/window.ts:1`): `showInformation/Warning/ErrorMessage` notifications (`notificationService` delegate, otherwise `__getShownMessages` queue), `showQuickPick`/`showInputBox`/`withProgress` dialogs, `createStatusBarItem` (`statusBarRegistry` delegate, otherwise `StatusBarItemImpl`), `createOutputChannel` (buffer), `tabGroups` (`openTab`/`close`/`pin`/`move`, `activeTextEditor`/`visibleTextEditors`/`onDidChangeActiveTextEditor`).
- **api: workspace** (`src/api/workspace.ts:1`): `fs` CRUD (`readFile/writeFile/readDirectory/createDirectory/delete/rename/stat`) with dual `fileService`/`fileIpc` delegate, otherwise in-memory tree + `onFileSystemChange`, `getConfiguration`/`onDidChangeConfiguration` (`affectsConfiguration`) with dual `settingsStore`, otherwise `configStore`, document/workspace events `onDidOpen/Close/Save/ChangeTextDocument`/`onDidChangeWorkspaceFolders` via `Emitter` + `__fire*`.
- **api: views** (`src/api/views.ts:1`): `ViewContainer`/`View` + `registerTreeDataProvider`/`registerWebviewViewProvider` (`activityBarRegistry`/`sidebarRegistry` delegate, otherwise in-memory), `getContainer`/`getView` + `onDidChangeViews`.
- **api: menus** (`src/api/menus.ts:1`): 13 `MenuLocation` + `evaluateWhenClause` (tokenizer + recursive-descent `&&`/`||`/`!`/`==`/`!=`/`=~`/`>`/`<`/`in` + regex `/.../flags` + `getMenus` `when` filter), `menuContributions` Map.
- **api: languages** (`src/api/languages.ts:1`): `registerCompletionItemProvider`/`registerHoverProvider`/`registerDefinitionProvider`/`registerDocumentFormattingEditProvider` (high-priority stubs — stored in-memory + `warnStubOnce`, needs a CodeMirror bridge), real-CRUD `createDiagnosticCollection`, real `setLanguageConfiguration`, `matchesSelector`, declarative `languages`/`grammars`.
- **api: theming** (`src/api/theming.ts:1`): `getActiveColorTheme`/`onDidChangeActiveColorTheme` (`vscode-dark` fallback + delegate to 51 `THEMES`), declarative `themes`/`iconThemes`/`productIconThemes`.
- **api: debug** (`src/api/debug.ts:1`): `registerDebugAdapterDescriptorFactory` (in-memory + warn), `startDebugging` throws `NotImplementedError` (low priority, no DAP yet), `onDidStart/TerminateDebugSession` events, declarative `debuggers`.
- **api: tasks** (`src/api/tasks.ts:1`): `registerTaskProvider` → `taskRegistry` (npm/cargo) delegate, otherwise in-memory, hybrid `executeTask` (fallback `onDidStartTask` → `queueMicrotask` → `onDidEndTask`), `fetchTasks`, `ShellExecution`/`ProcessExecution`/`CustomExecution`, declarative `taskDefinitions`.
- **api: scm** (`src/api/scm.ts:1`): `createSourceControl` (full-CRUD `SourceControlImpl` + `ResourceGroupImpl` with `inputBox`/`resourceStates`/`dispose` LIFO) → generic `scmRegistry` (git) delegate, otherwise in-memory, `onDidChangeSelectedSourceControl`.
- **api: snippets** (`src/api/snippets.ts:1`): declarative `contributes.snippets` → `snippetRegistry` (6 languages) + CodeMirror `snippetCompletion`; `registerSnippets` helper, case-insensitive `getSnippetsForLanguage`, `validateSnippet`.
- **api: authentication** (`src/api/authentication.ts:1`): in-memory `registerAuthenticationProvider` + `warnStubOnce`, `getSession` throws `NotImplementedError` (very low priority).
- **api: terminal** (`src/api/terminal.ts:1`): `createTerminal` (`TerminalImpl` buffer + `sendText`/`show`/`hide`/`dispose`) → `terminalStore` + `tauri-pty` delegate, `registerTerminalProfileProvider`/`registerTerminalLinkProvider`, `onDidOpen/CloseTerminal`.
- **api: extensions** (`src/api/extensions.ts:1`): `getExtension`/`all`/`onDidChange` via `ExtensionHost` + fallback `localExtensions` Map.
- **host** (`src/host/`): `ExtensionContext` (globalState/workspaceState `Memento` + warnOnce `SecretStorage` + `logChannel`, LIFO dispose), `NotronEventBus` (15 `SDK_EVENTS` + `bridgeExternalEvent`), `ExtensionHost` (`topologicalSort` + cycle/missing + lenient `isCompatible` `^`/`~`/`>=` + `register`→ isolated `activateAll` + LIFO `deactivateAll` + `hostLog`), `registerManifestContributions` (7 categories), error hierarchy `NotImplementedError`/`ExtensionActivationError`/`ExtensionRuntimeError` + `withErrorIsolation`.
- **cli** (`src/cli/`): 6 commands (`init`/`build`/`package`/`validate`/`install-local`/`list-templates`) via `runCli(argv)` + `esbuild` (`bundle:true, platform:node, target:es2020, format:cjs, external:['notron-sdk']`, dev `build` with minify false + sourcemap true, prod `package` with minify true + sourcemap false), `validateManifestWithFiles` (file-ref existence), SHA-256 `checksums.json`, `bin: notron-sdk/ntrn`, `files: ["dist","src/cli/templates","src/types/manifest.schema.json"]`. Full `hello-world` template + 3 stubs (`webview-view`/`language-support`/`custom-editor`).
- **testing** (`src/testing/index.ts:1`, `package.json:exports "./testing"`): `createMockNotron()` (in-memory for all 14 namespaces, `__getShownMessages`/`__getRegisteredCommands`/`__getStatusBarItems`/`__getSourceControls`/… introspection), `createMockContext(id?)` (fresh `InMemoryMemento`), `resetAllMocks()`/`__resetAllMocks()`. Used internally for some unit tests (`NOTRON_SDK_05_TESTING_DX §2`). Example:
  ```ts
  import { createMockNotron, createMockContext } from 'notron-sdk/testing';
  const notron = createMockNotron();
  const ctx = createMockContext('acme.demo');
  await myExtension.activate(ctx as never);
  await notron.commands.executeCommand('acme.demo.sayHello');
  expect(notron.window.__getShownMessages().some(m => m.message === 'Hello!')).toBe(true);
  ```
- **examples** (`packages/notron-sdk/examples/`): `hello-world` (command + notification + fs + tab), `sidebar-counter` (views + Memento + webview/tree providers), `markdown-preview` (languages + `when` menus + theming + stub custom editor) — smoke-tested via `ExtensionHost` in `test/fase3.test.ts` + `examples/hello-world` build→`.ntrn` in `test/fase5.test.ts`.
- **dx**: `tsconfig strict: true` (`noUnusedLocals/Params`), `ESLint 8.57` + `@typescript-eslint` (`.eslintrc.cjs`, `eslint src test --ext .ts`), all `typecheck`/`lint`/`test`/`build` scripts green; complete 9-section `README.md` (Introduction, Installation, Quick Start, Core Concepts, 14-namespace API Reference, 6-command CLI Reference, honest Implementation Status, Testing & Mock Host, Contributing) + this `CHANGELOG.md` + per-phase `IMPLEMENTATION_LOG.md`.

### Stubs / Not yet fully implementable (honest, not silent)

| Area | Status | Reason / core gap |
|---|---|---|
| `window.registerCustomEditorProvider`/`openEditorToSide`/`createWebviewPanel`/`registerWebviewViewProvider` (window) | **Stub** | Core has only 2 hardcoded previews (`previewRegistry.ts:14` .md/.svg) + `SplitView`, no generic registry + CSP yet (Limitation #4) |
| `workspace.registerFileSystemProvider` | **Stub** | Low priority (§3.5), core only has the local `TauriFileService` |
| `languages` providers (completion/hover/definition/formatting) | **High-priority stub** | Highlighting is already modular (80+ languages in `languageDetector.ts`), but runtime providers need an `editorExtensionRegistry`/`Compartment` bridge (IMPLEMENTATION_LOG Phase 3) |
| `theming` path dynamic import | **Light stub** | `contributes.themes[].path` is stored, not yet `import()`ed into `THEMES` + `applyThemeVariables` |
| `debug.startDebugging` | **Stub** | Core has no DAP host (only `runService` run without debugging) |
| `tasks.executeTask` (shell spawn) | **Hybrid stub** | `registerTaskProvider` is real, `executeTask` falls back without a real `cargo`/`npm` spawn |
| `authentication.getSession` | **Very-low stub** | Core has no auth/OAuth service |
| CLI templates `webview-view`/`language-support`/`custom-editor` | **Stub folders** | Minimal valid placeholders, same gaps (webview/language providers) |
| `signature` (code signing) | **Placeholder** | The `signature?: string` field is not implemented, `minisign`/`cosign` follow-up recommended |
| `install-local` loader | **Dev only** | Extracts `.ntrn` to `~/.notron/extensions-dev`; the desktop runtime uses core's own `.ntrn` installer and loader |

### Tested

- `bun test` **216 pass, 0 fail, 542 expect()** (7 files: `utils.test.ts` 1, `manifest.test.ts` 78, `host.test.ts` 40, `fase3.test.ts` 19, `fase4.test.ts` 28, `fase5.test.ts` 16, `testing.test.ts` 34). Including `init→build→package` → valid `.ntrn` (4 files, `checksums.json` 3 entries verified + tamper detection) for the `hello-world` template & `examples/hello-world`, `validate` negative 8 errors, `install-local` extraction.
- `bunx tsc --noEmit` exit 0 (strict), `bunx eslint src test --ext .ts` 0 errors (2 fixable warnings → 0 after the `prefer-const`/`no-constant-condition` fix), `bun run build` → `dist/` (`types`+`api`+`cli`+`host`+`testing`+`utils` `.d.ts`+`.js`).

### Notes

- The `.ntrn` format is a ZIP (`manifest.json` + `dist/extension.js` + `README.md`/`CHANGELOG.md` if present + `contributes.*` files + recursive `assets/` + SHA-256 `checksums.json`). The `signature` placeholder is reserved.
- `notron-sdk/testing` is exported via `package.json:exports "./testing"` + `tsconfig paths`.
- No **Deprecated** APIs in the initial release (all additive).
