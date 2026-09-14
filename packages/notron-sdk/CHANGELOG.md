# Changelog — notron-sdk

Semua perubahan penting dicatat di sini. Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/) dan versioning semver terpisah dari Notron app (`engines.notron` di tiap ekstensi menyatakan kompatibilitas).

## [0.1.0] — 2026-09-12 — Rilis Awal

Rilis awal `notron-sdk` (Fase 0–6) — permukaan API lengkap 14 namespace (nyata atau stub bertipe), toolchain `.ntrn`, dan Mock Host `notron-sdk/testing`. Belum ada versi sebelumnya; ini adalah baseline untuk `NOTRON_SDK_06_ROADMAP_PHASING.md` Fase 7 (Laporan Akhir).

### Ditambahkan

- **types & manifest** (`src/types/index.ts:1`, `src/utils/index.ts:1`): `ExtensionManifest` (id `publisher.name`, semver, `engines.notron` range, `permissions` 7 nilai, `activationEvents` 8 varian), 13 `ExtensionContributes` (commands, menus 13 `MenuLocation`, keybindings, viewsContainers, views, languages, grammars (CodeMirror 6/Lezer, bukan TextMate), themes/iconThemes/productIconThemes, snippets, configuration, debuggers, taskDefinitions), `ValidationResult`, `NotronExtensionConfig`/`defineConfig`/`Checksums`, `manifest.schema.json` (draft-07, 78 test `test/manifest.test.ts`).
- **utils**: `validateManifest`/`validatePermissions`/`validateActivationEvents`/`isValidActivationEvent`, `computeChecksumSync`/`computeChecksum`/`verifyChecksum`/`verifyChecksumSync`/`generateChecksums` (SHA-256 sync pure-JS FIPS 180-4 + Web Crypto async), vektor `hello → sha256:2cf24dba...`, tamper detection.
- **api: commands** (`src/api/commands.ts:1`): `registerCommand`/`executeCommand`/`getCommands` (merge 87 `KNOWN_CORE_COMMANDS` deduplicated + extension registry + `setCommandDelegate` → `commandRegistry`).
- **api: window** (`src/api/window.ts:1`): notifikasi `showInformation/Warning/ErrorMessage` (delegate `notificationService` else queue `__getShownMessages`), dialog `showQuickPick`/`showInputBox`/`withProgress`, `createStatusBarItem` (delegate `statusBarRegistry` else `StatusBarItemImpl`), `createOutputChannel` (buffer), `tabGroups` (`openTab`/`close`/`pin`/`move`, `activeTextEditor`/`visibleTextEditors`/`onDidChangeActiveTextEditor`).
- **api: workspace** (`src/api/workspace.ts:1`): `fs` CRUD (`readFile/writeFile/readDirectory/createDirectory/delete/rename/stat`) dual delegate `fileService`/`fileIpc` else in-memory tree + `onFileSystemChange`, `getConfiguration`/`onDidChangeConfiguration` (`affectsConfiguration`) dual `settingsStore` else `configStore`, document/workspace events `onDidOpen/Close/Save/ChangeTextDocument`/`onDidChangeWorkspaceFolders` via `Emitter` + `__fire*`.
- **api: views** (`src/api/views.ts:1`): `ViewContainer`/`View` + `registerTreeDataProvider`/`registerWebviewViewProvider` (delegate `activityBarRegistry`/`sidebarRegistry` else in-memory), `getContainer`/`getView` + `onDidChangeViews`.
- **api: menus** (`src/api/menus.ts:1`): 13 `MenuLocation` + `evaluateWhenClause` (tokenizer + recursive-descent `&&`/`||`/`!`/`==`/`!=`/`=~`/`>`/`<`/`in` + regex `/.../flags` + `getMenus` filter `when`), `menuContributions` Map.
- **api: languages** (`src/api/languages.ts:1`): `registerCompletionItemProvider`/`registerHoverProvider`/`registerDefinitionProvider`/`registerDocumentFormattingEditProvider` (stub prioritas tinggi — disimpan in-memory + `warnStubOnce`, butuh CodeMirror bridge), `createDiagnosticCollection` (CRUD real), `setLanguageConfiguration` (real), `matchesSelector`, declarative `languages`/`grammars`.
- **api: theming** (`src/api/theming.ts:1`): `getActiveColorTheme`/`onDidChangeActiveColorTheme` (fallback `vscode-dark` + delegate `THEMES` 51 tema), declarative `themes`/`iconThemes`/`productIconThemes`.
- **api: debug** (`src/api/debug.ts:1`): `registerDebugAdapterDescriptorFactory` (in-memory + warn), `startDebugging` throws `NotImplementedError` (prioritas rendah, DAP belum ada), events `onDidStart/TerminateDebugSession`, declarative `debuggers`.
- **api: tasks** (`src/api/tasks.ts:1`): `registerTaskProvider` → `taskRegistry` (npm/cargo) delegate else in-memory, `executeTask` hybrid (fallback `onDidStartTask` → `queueMicrotask` → `onDidEndTask`), `fetchTasks`, `ShellExecution`/`ProcessExecution`/`CustomExecution`, declarative `taskDefinitions`.
- **api: scm** (`src/api/scm.ts:1`): `createSourceControl` (`SourceControlImpl` + `ResourceGroupImpl` CRUD penuh `inputBox`/`resourceStates`/`dispose` LIFO) → `scmRegistry` generic (git) delegate else in-memory, `onDidChangeSelectedSourceControl`.
- **api: snippets** (`src/api/snippets.ts:1`): declarative `contributes.snippets` → `snippetRegistry` (6 bahasa) + `snippetCompletion` CodeMirror; `registerSnippets` helper, `getSnippetsForLanguage` (case-insensitive), `validateSnippet`.
- **api: authentication** (`src/api/authentication.ts:1`): `registerAuthenticationProvider` in-memory + `warnStubOnce`, `getSession` throws `NotImplementedError` (prioritas sangat rendah).
- **api: terminal** (`src/api/terminal.ts:1`): `createTerminal` (`TerminalImpl` buffer + `sendText`/`show`/`hide`/`dispose`) → `terminalStore` + `tauri-pty` delegate, `registerTerminalProfileProvider`/`registerTerminalLinkProvider`, `onDidOpen/CloseTerminal`.
- **api: extensions** (`src/api/extensions.ts:1`): `getExtension`/`all`/`onDidChange` via `ExtensionHost` + fallback `localExtensions` Map.
- **host** (`src/host/`): `ExtensionContext` (globalState/workspaceState `Memento` + `SecretStorage` warnOnce + `logChannel`, LIFO dispose), `NotronEventBus` (15 `SDK_EVENTS` + `bridgeExternalEvent`), `ExtensionHost` (`topologicalSort` + cycle/missing + `isCompatible` lenient `^`/`~`/`>=` + `register`→`activateAll` isolate + `deactivateAll` LIFO + `hostLog`), `registerManifestContributions` (7 kategori), error hierarchy `NotImplementedError`/`ExtensionActivationError`/`ExtensionRuntimeError` + `withErrorIsolation`.
- **cli** (`src/cli/`): 6 perintah (`init`/`build`/`package`/`validate`/`install-local`/`list-templates`) via `runCli(argv)` + `esbuild` (`bundle:true, platform:node, target:es2020, format:cjs, external:['notron-sdk']`, `build` dev minify false sourcemap true, `package` prod minify true sourcemap false), `validateManifestWithFiles` (file refs existence), `checksums.json` SHA-256, `bin: notron-sdk/ntrn`, `files: ["dist","src/cli/templates"]`. Template `hello-world` full + 3 stub (`webview-view`/`language-support`/`custom-editor`).
- **testing** (`src/testing/index.ts:1`, `package.json:exports "./testing"`): `createMockNotron()` (in-memory untuk ke-14 namespace, introspection `__getShownMessages`/`__getRegisteredCommands`/`__getStatusBarItems`/`__getSourceControls`/…), `createMockContext(id?)` (fresh `InMemoryMemento`), `resetAllMocks()`/`__resetAllMocks()`. Dipakai internal untuk sebagian unit test (`NOTRON_SDK_05_TESTING_DX §2`). Contoh:
  ```ts
  import { createMockNotron, createMockContext } from 'notron-sdk/testing';
  const notron = createMockNotron();
  const ctx = createMockContext('acme.demo');
  await myExtension.activate(ctx as never);
  await notron.commands.executeCommand('acme.demo.sayHello');
  expect(notron.window.__getShownMessages().some(m => m.message === 'Hello!')).toBe(true);
  ```
- **examples** (`packages/notron-sdk/examples/`): `hello-world` (command + notification + fs + tab), `sidebar-counter` (views + Memento + webview/tree provider), `markdown-preview` (languages + menus `when` + theming + stub custom editor) — smoke via `ExtensionHost` di `test/fase3.test.ts` + `examples/hello-world` build→`.ntrn` di `test/fase5.test.ts`.
- **dx**: `tsconfig strict: true` (`noUnusedLocals/Params`), `ESLint 8.57` + `@typescript-eslint` (`.eslintrc.cjs`, `eslint src test --ext .ts`), script `typecheck`/`lint`/`test`/`build` semua lolos; `README.md` lengkap 9 bagian (Pendahuluan, Instalasi, Quick Start, Konsep Inti, Referensi API 14 namespace, CLI Reference 6 perintah, Status Implementasi jujur, Testing & Mock Host, Contributing) + `CHANGELOG.md` ini + `IMPLEMENTATION_LOG.md` per fase.

### Stub / Belum Bisa Diimplementasikan Penuh (Jujur, Bukan Silent)

| Area | Status | Alasan / Gap Core |
|---|---|---|
| `window.registerCustomEditorProvider`/`openEditorToSide`/`createWebviewPanel`/`registerWebviewViewProvider` (window) | **Stub** | Core hanya 2 preview hardcoded (`previewRegistry.ts:14` .md/.svg) + `SplitView`, belum registry generik + CSP Batasan #4 |
| `workspace.registerFileSystemProvider` | **Stub** | Prioritas rendah (§3.5), core hanya `TauriFileService` lokal |
| `languages` providers (completion/hover/definition/formatting) | **Stub prioritas tinggi** | Highlighting sudah modular (80+ bahasa `languageDetector.ts`), tapi provider runtime butuh `editorExtensionRegistry`/`Compartment` bridge (IMPLEMENTATION_LOG Fase 3) |
| `theming` path dynamic import | **Stub ringan** | `contributes.themes[].path` disimpan, belum `import()` ke `THEMES` + `applyThemeVariables` |
| `debug.startDebugging` | **Stub** | Core tanpa DAP host (hanya `runService` run tanpa debug) |
| `tasks.executeTask` (shell spawn) | **Hybrid stub** | `registerTaskProvider` real, `executeTask` fallback tanpa `cargo`/`npm` spawn nyata |
| `authentication.getSession` | **Stub sangat rendah** | Core tanpa auth/OAuth service |
| CLI templates `webview-view`/`language-support`/`custom-editor` | **Stub folder** | Placeholder valid minimal, gap sama (webview/language provider) |
| `signature` (code signing) | **Placeholder** | Field `signature?: string` tidak diimplementasikan, rekomendasi `minisign`/`cosign` lanjutan |
| `install-local` loader | **Dev only** | Ekstrak `.ntrn` ke `~/.notron/extensions-dev`; runtime desktop memakai installer dan loader `.ntrn` milik core |

### Diuji

- `bun test` **216 pass, 0 fail, 542 expect()** (7 files: `utils.test.ts` 1, `manifest.test.ts` 78, `host.test.ts` 40, `fase3.test.ts` 19, `fase4.test.ts` 28, `fase5.test.ts` 16, `testing.test.ts` 34). Termasuk `init→build→package` → `.ntrn` valid (4 file, `checksums.json` 3 entries verified + tamper detection) untuk `hello-world` template & `examples/hello-world`, `validate` negative 8 errors, `install-local` ekstrak.
- `bunx tsc --noEmit` exit 0 (strict), `bunx eslint src test --ext .ts` 0 errors (2 warnings fixable → 0 setelah fix `prefer-const`/`no-constant-condition`), `bun run build` → `dist/` (`types`+`api`+`cli`+`host`+`testing`+`utils` `.d.ts`+`.js`).

### Catatan

- Format `.ntrn` adalah ZIP (`manifest.json` + `dist/extension.js` + `README.md`/`CHANGELOG.md` jika ada + file `contributes.*` + `assets/` rekursif + `checksums.json` SHA-256). `signature` placeholder dicadangkan.
- `notron-sdk/testing` diekspor via `package.json:exports "./testing"` + `tsconfig paths`.
- Tidak ada **Deprecated** API di rilis awal (semua additive).
