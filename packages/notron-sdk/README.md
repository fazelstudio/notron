# notron-sdk

Public SDK untuk membangun ekstensi Notron — analog dengan modul `vscode` di VS Code. Menyediakan tipe manifest, 14 namespace API, runtime host, pengecekan checksum, dan CLI toolchain (`notron-sdk` / `ntrn`) untuk membundel ekstensi menjadi `.ntrn`.

> Notron adalah desktop code editor (Tauri 2 + Svelte 5 + CodeMirror 6). SDK ini adalah permukaan publik bagi ekstensi pihak ketiga. Prinsip inti Notron: **setiap fitur → command `namespace.aksi` + `executeCommand(id)` terpusat** (`src/lib/commands/registry.ts:48`).

Rujukan desain: `docs/modules/NOTRON_SDK_00_INDEX.md` — `NOTRON_SDK_06_ROADMAP_PHASING.md`. Implementasi nyata vs stub bertipe mengikuti aturan `NOTRON_SDK_00_INDEX.md:2` (stub melempar `NotImplementedError` deskriptif, bukan silent).

---

## 1. Pendahuluan

`notron-sdk` mengekspos API stabil untuk kode ekstensi — sama seperti `import * as vscode from 'vscode'` di VS Code, di Notron:

```ts
import { commands, window, workspace } from 'notron-sdk';
import { ExtensionContext } from 'notron-sdk';
```

Host runtime (`ExtensionHost`, `ExtensionContext`, `NotronEventBus`, `Memento`, `SecretStorage`) dijembatani ke core Notron via delegate (`setCommandDelegate` → `commandRegistry.execute`, `setWindowDelegate` → `statusBarRegistry`/`dialogService`, `setWorkspaceDelegate` → `fileService`/`settingsStore`). Di luar Notron (test / dev) SDK berjalan standalone dengan fallback in-memory yang tetap memenuhi kontrak tipe.

`ExtensionHost` menghormati `activationEvents`: `activateAll()` hanya memproses
ekstensi startup (`*` dan `onStartupFinished`), sedangkan host dapat memanggil
`activateByEvent('onCommand:contoh.command')` untuk aktivasi tertunda.
Kontribusi deklaratif didaftarkan sebelum aktivasi sehingga UI dapat
mengagregasikan manifest tanpa mengimpor kode ekstensi secara langsung.

API `discord` adalah capability host yang opsional untuk ekstensi presence atau
integrasi aktivitas lain. Di luar host desktop API ini aman digunakan karena
fallback-nya mengembalikan `{ connected: false }` dan operasi aktivitas menjadi
no-op.

Pemisahan `src/lib/workbench/*Registry` (activityBar, sidebar, bottomPanel, statusBar, menu, preview, scm, task, snippet, settings) membuat kontainer view/panel/menu bersifat registry-driven — ekstensi cukup deklarasi di `manifest.json`, tidak menyentuh shell.

---

## 2. Instalasi

Di proyek ekstensi (setelah `notron-sdk init` atau manual):

```bash
npm install notron-sdk
# atau
bun add notron-sdk
```

`notron-sdk` adalah **peer dependency** — jangan dibundel ke `dist/extension.js`. CLI menandainya `external: ['notron-sdk']` (esbuild `bundle: true, platform: node, format: cjs`), host menyediakan implementasi nyata saat runtime. Untuk IntelliSense `notron-extension.config.ts`, impor helper:

```ts
import { defineConfig } from 'notron-sdk';
export default defineConfig({ external: ['react'], target: 'es2022' });
```

Prasyarat dev: `bun` (runner test), `typescript@~5.8`, `esbuild`, `adm-zip`.

---

## 3. Quick Start

Lengkap dari `init` sampai `.ntrn` (memvalidasi `NOTRON_SDK_04_PACKAGE_CLI` §3 + `NOTRON_SDK_05_TESTING_DX` §4):

```bash
# 1) scaffold — template hello-world (full) tersedia, 3 lain stub (lihat Status)
npx notron-sdk init my-extension --template hello-world
cd my-extension
npm install   # package.json sudah depend on notron-sdk ^0.1.0

# 2) lihat manifest awal (valid minimal)
cat manifest.json
# { "id": "acme.my-extension", "publisher": "acme", "version": "0.1.0",
#   "engines": { "notron": "^0.1.0" }, "main": "./dist/extension.js",
#   "activationEvents": ["onCommand:acme.helloWorld"], "contributes": { "commands": [...] } }

# 3) koding — src/extension.ts contoh:
#    import * as notron from 'notron-sdk';
#    export function activate(ctx) {
#      ctx.subscriptions.push(
#        notron.commands.registerCommand('acme.helloWorld', async () => {
#          await notron.window.showInformationMessage('Hello from Notron!');
#        })
#      );
#    }

# 4) dev loop — bundle dev (tanpa minify, dengan sourcemap)
npx notron-sdk build
# atau watch:
npx notron-sdk build --watch   # esbuild.context().watch()

# 5) validasi manifest (cek engines semver, activationEvents, file contributes)
npx notron-sdk validate
# ✓ manifest valid: manifest.json
# npx notron-sdk validate ./manifest.json  # explicit path juga bisa

# 6) package — prod build (minify, tanpa sourcemap) + checksums + ZIP .ntrn
npx notron-sdk package
# → my-extension-0.1.0.ntrn (ZIP: manifest.json, dist/extension.js, README.md, checksums.json)
#   checksums.json: { "dist/extension.js": "sha256:...", "manifest.json": "sha256:..." }
#   verify: import { verifyChecksum } from 'notron-sdk/utils'

# 7) install lokal (dev only — lihat catatan)
npx notron-sdk install-local my-extension-0.1.0.ntrn
# → ~/.notron/extensions-dev/acme.my-extension/
# Catatan: install-local hanya untuk inspeksi/testing lokal. Untuk memasang paket
# sebagai pengguna, gunakan Command Palette → Extensions: Install from .ntrn…

# 8) lihat template lain
npx notron-sdk list-templates
# hello-world, webview-view, language-support, custom-editor
```

Struktur proyek yang dihasilkan `init`:

```
my-extension/
├── manifest.json          # ExtensionManifest (id publisher.name, semver, contributes)
├── src/
│   └── extension.ts       # activate(ctx: ExtensionContext)/deactivate()
├── package.json           # dependency notron-sdk
├── tsconfig.json
├── .gitignore             # dist/, *.ntrn
└── README.md
```

---

## 4. Konsep Inti

Ringkas, tautkan ke dokumen untuk detail penuh (`NOTRON_SDK_01_API_SURFACE.md`, `NOTRON_SDK_02_MANIFEST_TYPES.md`):

- **Extension** — kode pihak ketiga dikemas `.ntrn` (ZIP), dijalankan via `activate(context: ExtensionContext): void|Promise<void>` / `deactivate?(): void|Promise<void>`. `context.subscriptions: Disposable[]` dibersihkan LIFO saat deactivate (host `lifecycle.ts: dispose()` reverse loop, spec §1 step 7). `context.globalState` / `workspaceState` (`Memento`), `secrets` (`SecretStorage`), `logChannel` (`OutputChannel` per `Extension:<id>`), `extensionPath`/`extensionUri`.

- **Manifest** (`ExtensionManifest`) — identitas `id: publisher.name` (regex `ID_REGEX`), `name`, `version` semver, `publisher`, `engines.notron` semver range (validasi `SEMVER_RANGE_LOOSE`), `main` (relative path JS entry), `activationEvents` (minimal 1, pola `onCommand:`/`onLanguage:`/`onView:`/`onUri`/`onStartupFinished`/`workspaceContains:`/`onCustomEditor:`/`*`), `contributes` (13 kategori), `permissions` (7 nilai enum). Validasi via `validateManifest()` / `validatePermissions()` / `validateActivationEvents()` di `src/utils/index.ts` (100% Fase 1, 78 test `test/manifest.test.ts`). JSON Schema tersedia `src/types/manifest.schema.json` (draft-07, dipakai `cli validate`).

- **Activation Event** — kapan host mengaktifkan ekstensi. Minimal satu. `onCommand:` paling umum untuk lazy activation, `onStartupFinished` untuk yang perlu segera, `*` untuk selalu (hindari jika tidak perlu).

- **Contribution Point** — deklaratif di `contributes.*` (bukan API imperatif). 13 kategori: `commands` (command `namespace.aksi` + title), `menus` (13 `MenuLocation`: `commandPalette`, `editor/context`, `editor/title`, `explorer/context`, `view/title`, `view/item/context`, `tab/context`, `menubar/file`..`menubar/help`, `pane/context`), `keybindings`, `viewsContainers` (`activitybar`/`panel`), `views` (`Record<containerId, View[]>` type `tree`|`webview`), `languages` (id + extensions), `grammars` (path ke modul CodeMirror 6/Lezer, bukan TextMate), `themes`/`iconThemes`/`productIconThemes`, `snippets`, `configuration` (`title` + `properties`), `debuggers`, `taskDefinitions`. Dibaca host `src/host/contributions.ts:registerManifestContributions` sebelum `activate()`, dispose otomatis via `context.subscriptions`.

- **Disposable** — setiap registrasi `register*` mengembalikan `{ dispose() }`. Daftarkan ke `context.subscriptions` agar dibersihkan LIFO saat deactivate. Helper `toDisposable(fn)` dan `combinedDisposable(...ds)` di `src/api/types.ts`. Error isolation: setiap `activate`/`deactivate`/handler/event listener dibungkus `try/catch` → `ExtensionActivationError`/`ExtensionRuntimeError` (host `errors.ts:withErrorIsolation`), satu ekstensi gagal tidak menghentikan host atau ekstensi lain (diuji `test/host.test.ts` 40 test).

---

## 5. Referensi API

Semua 14 namespace terwakili (nyata atau stub bertipe lengkap, tidak ada yang terlewat — Fase 4 tercapai). Tipe didokumentasikan via TSDoc di `src/api/*.ts`; saat ini referensi ditulis manual (belum digenerate TypeDoc otomatis — rekomendasi lanjutan). Import:

```ts
import { commands, window, workspace, views, menus, languages, theming, debug, tasks, scm, snippets, authentication, terminal, extensions } from 'notron-sdk';
// atau namespaced: import * as notron from 'notron-sdk';
```

| Namespace | Status | Signature penting | Catatan |
|---|---|---|---|
| `commands` (§1) | **Stabil** | `registerCommand(id, handler): Disposable`, `executeCommand<T>(id, ...args): Promise<T\|undefined>`, `getCommands(filterInternal?): Promise<string[]>` | Dijembatani ke `commandRegistry` (`src/lib/commands/registry.ts:48`) via `setCommandDelegate`; 87 ID core dikenal di `KNOWN_CORE_COMMANDS`; throw jika ID sudah terdaftar ekstensi lain (kecuali same extension re-register); error isolation via `ExtensionRuntimeError` |
| `window` §2.1 notifikasi/dialog | **Stabil** | `showInformationMessage`/`showWarningMessage`/`showErrorMessage(msg, ...items): Promise<string\|undefined>`, `showQuickPick(items, opts)`, `showInputBox(opts)`, `withProgress(opts, task)` | Delegate ke `notificationService`/`dialogService` (`QuickPickDialog`/`InputBoxDialog`) bila ada, else fallback in-memory queue + `__getShownMessages()` untuk test |
| `window` §2.2 status bar | **Stabil** | `createStatusBarItem(alignment?, priority?): StatusBarItem { text, tooltip, command, show/hide/dispose }` | CRUD penuh; delegate ke `statusBarRegistry.register` bila ada, else `StatusBarItemImpl` + Map; `__getStatusBarItems()` |
| `window` §2.3 output | **Stabil** | `createOutputChannel(name): OutputChannel { append/appendLine/clear/show/hide/dispose }` | Fallback buffer string; juga untuk `ExtensionContext.logChannel` dan `ExtensionHost.hostLog` (`OUTPUT_CATEGORIES: Extension Host`) |
| `window` §2.4 tabGroups | **Stabil** | `tabGroups.all/activeTab/openTab(uri, {viewColumn,preview})`, `tab.close/pin/move`, `onDidChangeActiveTab/onDidChangeTabGroups`, `activeTextEditor/visibleTextEditors/onDidChangeActiveTextEditor` | Fallback store `TabGroup[]` + `Emitter`; delegate ke `splitStore`/`editorStore` bila ada; `__setActiveTextEditor`/`__setTabGroups` untuk bridge |
| `window` §2.5 custom editor | **Stub** | `registerCustomEditorProvider(viewType, provider): Disposable`, `openEditorToSide(uri, viewType?)` | `throw NotImplementedError` — core hanya punya `MarkdownPreview`/`ImageViewer`/`DiffEditor` hardcoded (`previewRegistry.ts:14`, 2 provider .md/.svg) + `SplitView`, belum registry generik + CSP isolation (Batasan #4) |
| `window` §2.6 webview | **Stub** | `createWebviewPanel(viewType, title, showOptions, options): WebviewPanel`, `registerWebviewViewProvider(viewId, provider): Disposable` (window) | `throw NotImplementedError` — belum ada host webview/CSP; `views.registerWebviewViewProvider` (views namespace) **Stabil** sebagai alternatif (delegate ke `sidebarRegistry`) |
| `workspace` §3.1 folders | **Stabil** | `workspaceFolders: WorkspaceFolder[]\|undefined`, `onDidChangeWorkspaceFolders` | Bridge `eventBus 'request-workspace-switch'` → `__setWorkspaceFolders` |
| `workspace` §3.2 dokumen | **Stabil** | `onDidOpenTextDocument`/`onDidCloseTextDocument`/`onDidSaveTextDocument`/`onDidChangeTextDocument: Event<TextDocument>` | Via `Emitter` + helper `__fireDidOpen/Close/Save/Change`; host bridge `eventBus 'request-open-file'`/`split:request-close-tab`/`editor:action` + CodeMirror `updateListener` → `editor:sync-content` |
| `workspace` §3.3 fs | **Stabil** | `fs.readFile/writeFile/readDirectory/createDirectory/delete/rename/stat(uri): Promise<...>` | Dual: delegate ke `fileService`/`fileIpc` (`invoke('read_file_text', ...)`) bila ada, else fallback in-memory tree `Map` (CRUD penuh + `onFileSystemChange` dari mutasi / Tauri `fs-change` `watcher_service.rs:346`) |
| `workspace` §3.4 config | **Stabil** | `getConfiguration(section?): WorkspaceConfiguration { get/has/update }`, `registerConfiguration(...)`, `onDidChangeConfiguration: Event<ConfigurationChangeEvent>` | Runtime schema contributions are delegated to the host settings registry; values still use the normal global/workspace configuration path |
| `workspace` §3.5 fs provider | **Stub** | `registerFileSystemProvider(scheme, provider): Disposable` | Prioritas rendah (§3.5), `throw NotImplementedError` — core hanya `TauriFileService` lokal |
| `views` §5 | **Stabil** | `getContainer(id)/getContainers()/getView(id)/getViews(containerId?)`, `registerTreeDataProvider<T>(viewId, provider)`, `registerWebviewViewProvider(viewId, provider)`, `onDidChangeViews` | In-memory `containers/viewsMap/treeProviders/webviewProviders` + delegate ke `activityBarRegistry`/`sidebarRegistry`; declarative `contributes.viewsContainers/views` via host `contributions.ts` |
| `menus` §6 | **Stabil** | `evaluateWhenClause(expr, ctx): boolean`, `getMenus(location, ctx): MenuEntry[]` + 13 `MenuLocation` | Parser lengkap (tokenizer + recursive-descent: `&&`/`||`/`!`/`==`/`!=`/`=~`/`>`/`<`/`in` + `()` + quoted/unquoted `.js` literal + regex `/.../flags`); declarative `contributes.menus` via host |
| `languages` §4 (completion/hover/definition/formatting) | **Stub prioritas tinggi** | `registerCompletionItemProvider(selector, provider, ...triggerChars)`, `registerHoverProvider`, `registerDefinitionProvider`, `registerDocumentFormattingEditProvider` | Highlighting per bahasa **sudah modular** (80+ bahasa `languageDetector.ts:LANG_LOADERS` + `languageRegistry` per-bahasa + `Editor.svelte:langCompartment` lazy) — gap hanya provider dinamis runtime (butuh `editorExtensionRegistry`/`Compartment` bridge ke CodeMirror; SDK simpan in-memory + `warnStubOnce`, host belum wiring) |
| `languages` diagnostics/config | **Stabil** | `createDiagnosticCollection(name?): DiagnosticCollection { set/get/has/delete/clear/forEach/dispose }`, `setLanguageConfiguration(languageId, config)`, `matchesSelector` | CRUD penuh in-memory (`DiagnosticCollectionImpl` + `Emitter`); declarative `languages`/`grammars` via host |
| `theming` §7 | **Stabil** | `getActiveColorTheme(): ColorTheme {kind:'light'|'dark', id}`, `onDidChangeActiveColorTheme`, `getContributedThemes()`, `getContributedIconThemes()` | Fallback `activeTheme` + `themeEmitter`; declarative `contributes.themes/iconThemes/productIconThemes` via host |
| `activity` | **Optional** | `init()`, `setActivity(...)`, `clear()` | Generic host capability; legacy `discord` namespace aliases this API |
| `debug` §8 | **Stub (prioritas rendah)** | `registerDebugAdapterDescriptorFactory(debugType, factory)`, `startDebugging(folder, config): Promise<boolean>`, `onDidStart/TerminateDebugSession` | Declarative `contributes.debuggers` data-only real; `startDebugging` `throw NotImplementedError` — core belum punya DAP host (hanya `runService`/`runProviderRegistry` run tanpa debug; `grep DAP` 0 hit) |
| `tasks` §9 | **Stabil (sebagian)** | `registerTaskProvider(type, provider)`, `executeTask(task): Promise<TaskExecution>`, `fetchTasks(filter?)`, `onDidStart/EndTask`, `ShellExecution/ProcessExecution/CustomExecution` | Delegate ke `taskRegistry.register` (`npm`/`cargo` `contrib/debug/taskProviders.ts`) bila ada, else fallback in-memory; `executeTask` fallback emit `onDidStartTask` → `queueMicrotask` → `onDidEndTask` tanpa shell nyata (hybrid) |
| `scm` §10 | **Stabil (sebagian)** | `createSourceControl(id,label,rootUri?): SourceControl { createResourceGroup/ inputBox/count}`, `getSourceControls()`, `onDidChangeSelectedSourceControl` | Delegate ke `scmRegistry.register` generic (`git` provider `SourceControlPanel`) bila ada, else fallback `SourceControlImpl` CRUD penuh (groups + `resourceStates` setter + `inputBox`); core `scmRegistry` sudah generic |
| `snippets` §11 | **Stabil (deklaratif)** | `getSnippetsForLanguage(lang): Snippet[]`, `getAllSnippetContributions()`, `registerSnippets(lang, snippets)`, `validateSnippet(obj)` | Declarative `contributes.snippets` real → `snippetRegistry` (`getForLanguage`, 6 bahasa) + `snippetCompletion.ts` CodeMirror `languageData`; imperative `SnippetString` tidak diekspos (prioritas sangat rendah) |
| `authentication` §12 | **Stub (sangat rendah)** | `registerAuthenticationProvider(id,label,provider)`, `getSession(providerId, scopes, opts): Promise<AuthenticationSession\|undefined>`, `onDidChangeSessions` | In-memory `providers Map` + `warnStubOnce`; `getSession` `throw NotImplementedError` — core tanpa auth/OAuth (0 hit) |
| `terminal` §13 | **Stabil** | `createTerminal(options?): Terminal { sendText/show/hide/dispose, processId, exitStatus }`, `registerTerminalProfileProvider`, `registerTerminalLinkProvider`, `onDidOpen/CloseTerminal` | Delegate ke `terminalStore.newTerminal` + `tauri-pty` (`TerminalInstance.svelte` spawn + xterm FitAddon + 6 `terminalCommands`) bila ada, else fallback `TerminalImpl` CRUD penuh (buffer + `__getTerminals`) |
| `extensions` §14 | **Stabil** | `getExtension(id): ExtensionInfo\|undefined`, `all: ExtensionInfo[]`, `onDidChange: Event<void>` | Via `ExtensionHost.allExtensions/getExtension` + fallback `localExtensions` Map (`ExtensionInfo {id, version, publisher, isActive, exports, packageJSON}`) |

Host runtime (`NOTRON_SDK_03_HOST_RUNTIME`): `ExtensionContext` (globalState/workspaceState `Memento` + `SecretStorage` in-memory warnOnce + `logChannel`), `NotronEventBus` (`emit/on/onTyped/clear/count`, 15 `SDK_EVENTS`, `bridgeExternalEvent`), `ExtensionHost` (`topologicalSort` + cycle/missing + `isCompatible` lenient semver `^`/`~`/`>=` + `register`→`activateAll` isolate + `deactivateAll` LIFO), `registerManifestContributions` (7 kategori). Error isolation di semua entry point.

> Detail tabel event & command mapping ke core nyata: lihat `IMPLEMENTATION_LOG.md` Fase 2 (final) + Fase 0 inventory 87 command.

---

## 6. CLI Reference

Binary: `notron-sdk` (alias `ntrn`) via `package.json:bin` → `dist/cli/bin.js` (`#!/usr/bin/env node`, `runCli(argv)`).

### `notron-sdk init [name] [--template <name>]`

Scaffold proyek baru. Template:

| Nama | Status | Isi |
|---|---|---|
| `hello-world` | **Full** | `manifest.json` `acme.hello-world`, `src/extension.ts` `import * as notron from 'notron-sdk'` + `registerCommand hello-world.hello` (activate: `globalState.helloCount` + `getConfiguration(theme)` + `OutputChannel` + `StatusBarItem` + document/config/tab events), `package.json` (`notron-sdk ^0.1.0`), `tsconfig.json`, `.gitignore` (dist, *.ntrn), `README.md` |
| `webview-view` | **Stub** | manifest `viewsContainers` + `views` webview minimal + placeholder `src/extension.ts` + README `stub` |
| `language-support` | **Stub** | manifest `languages` + `grammars` `.my` + placeholder |
| `custom-editor` | **Stub** | manifest `customEditors` placeholder + placeholder |

`src/cli/templates/hello-world/` disalin via `getTemplatesDir()` (dist + src fallback) → `copyTemplateDir` (`gitignore` → `.gitignore`) → patch `manifest.json`/`package.json`/`src/extension.ts` `hello-world` → `<sanitized>`.

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

Bundle via **esbuild** (`src/extension.ts` → `manifest.main` default `dist/extension.js`):

- `format: cjs` (CommonJS) — Host memuat via dynamic import interop. `esm` via `notron-extension.config.ts` `format: 'esm'`.
- `platform: node`, `target: es2020` (override via config), `external: ['notron-sdk', ...config.external]`.
- **build** (default): `minify: false`, `sourcemap: true` (dev, `sourcesContent:false`, logLevel info).
- `--watch`: `esbuild.context().watch()` rebuild otomatis, keep process alive.

Override via `notron-extension.config.{ts,js,mjs,cjs,json}` (`NotronExtensionConfig` di `src/types/index.ts:284`: `entry`, `outfile`, `external`, `target`, `format`, `minify`, `sourcemap`, `esbuildOptions`).

### `notron-sdk package`

1. Validasi manifest (fail-fast, `validateManifestWithFiles`).
2. Production build: `minify: true`, `sourcemap: false` (hapus stale `.map`).
3. Kumpulkan: `manifest.json`, `dist/extension.js` (dari `manifest.main`), `README.md`/`CHANGELOG.md` jika ada, file `contributes.*` (`languages.configuration`, `grammars.path`, `themes.path`, `snippets.path`, `debuggers.program`, `icon` + `assets/` rekursif).
4. Hitung `checksums.json`: `{ "dist/extension.js": "sha256:...", ... }` SHA-256 per file (kecuali dirinya sendiri) via `computeChecksumSync` (pure-JS FIPS 180-4 fallback + Web Crypto async).
5. ZIP ke `<name>-<version>.ntrn` di root proyek (`AdmZip`).

Gagal jika manifest invalid — jangan hasilkan `.ntrn` dari manifest tidak valid (exit 1).

### `notron-sdk validate [path]`

Validasi `manifest.json` terhadap skema (`validateManifest` Fase 1 + §5.1 `manifest.schema.json`) + cek file referensi `contributes.*` benar-benar ada. Output `path: message` + `✖`/`✓` readable. Programatik `validateCommand(manifestArg, { cwd, manifestPath }) → { valid, errors, manifestPath }`.

```
[notron-sdk] ✖ manifest invalid: manifest.json
  ✖ id: must match publisher.name ...
  ✖ contributes.grammars[0].path: file not found: "./missing.json"
```

### `notron-sdk install-local <path.ntrn>`

Ekstrak `.ntrn` ke `~/.notron/extensions-dev/<extensionId>/` (dev convenience).
Untuk instalasi pengguna, gunakan Command Palette Notron: `Extensions: Install from
.ntrn…`. Core memvalidasi manifest, menolak path traversal ZIP, menyimpan paket di
application data, menemukan kembali paket saat startup/workspace switch, dan
mengaktifkan entry CommonJS hasil bundle melalui `notron-sdk`.

Runtime desktop hanya menyediakan `notron-sdk` kepada entry point terpasang. Native
Node modules, arbitrary `require`, dan ESM imports yang perlu resolver eksternal
belum didukung karena the webview bundle is produced by Vite.

### `notron-sdk list-templates`

Cetak `hello-world`, `webview-view`, `language-support`, `custom-editor`.

### `notron-extension.config.ts` (opsional)

```ts
import { defineConfig } from 'notron-sdk';
export default defineConfig({
  entry: 'src/extension.ts',
  outfile: 'dist/extension.js',
  external: ['react'],
  target: 'es2022',
  format: 'cjs', // atau 'esm'
  minify: false,
  sourcemap: true,
  esbuildOptions: { /* raw esbuild.BuildOptions */ }
});
```

Tipe `NotronExtensionConfig` diekspor untuk IntelliSense.

---

## 7. Status Implementasi

Jujur, diambil dari `IMPLEMENTATION_LOG.md` Fase 0–5 (append-only). Tabel konsisten dengan Laporan Akhir Fase 7 nanti. **Stabil** = implementasi nyata + fallback bridgeable + diuji; **Stub** = signature final + `NotImplementedError`/`warnStubOnce` + alasan gap core; **Deprecated** = tidak ada (0).

| Namespace / Area | Status | Catatan jujur (sumber log) |
|---|---|---|
| **types** `ExtensionManifest` / `ActivationEvent` / `ExtensionPermission` / 13 `ExtensionContributes` | **Stabil** | Fase 1: seluruh interface + 13 sub-tipe + `MenuLocation` 13 nilai (superset dari 7 di spec, selaras `menuRegistry.ts:11` menubar/pane) + `ValidationResult`; `manifest.schema.json` draft-07; `validateManifest`/`validatePermissions`/`validateActivationEvents` 78 test |
| **utils** `joinUri`/`isString` + `validate*` + `computeChecksum`/`verifyChecksum` | **Stabil** | Fase 1 validate + Fase 5 checksum SHA-256 sync pure-JS (vektor `hello → sha256:2cf24dba...` + tamper detection) + `generateChecksums`; `NotronExtensionConfig`/`defineConfig`/`Checksums` |
| `commands` | **Stabil** | Fase 2: registry lokal + `KNOWN_CORE_COMMANDS` 87 ID deduplicated + `setCommandDelegate` → `commandRegistry.execute`/`getCommands`; `getCommands` merge deduplicated + `filterInternal`; error isolation `ExtensionRuntimeError` |
| `window` notifikasi/dialog/progress | **Stabil** | `showInformation/Warning/ErrorMessage` → `windowDelegate.show*Message` else queue + `__getShownMessages`; `showQuickPick`/`showInputBox` → `dialogService` else `undefined`; `withProgress` → `dialogService.withProgress` else no-op |
| `window` status bar | **Stabil** | `createStatusBarItem` CRUD penuh → `statusBarRegistry.register` else `StatusBarItemImpl` Map |
| `window` output channel | **Stabil** | `createOutputChannel` buffer string + `__getOutputChannelText` |
| `window` tabGroups/editor | **Stabil** | `tabGroups.openTab/close/pin/move` + `activeTextEditor/visibleTextEditors/onDidChangeActiveTextEditor` fallback store; `__setActiveTextEditor` untuk bridge |
| `window` custom editor/webview | **Stub** | Fase 2+3: `throw NotImplementedError('window.registerCustomEditorProvider'/'createWebviewPanel'/'registerWebviewViewProvider')` — core hanya 2 preview hardcoded (`previewRegistry.ts:14`) + `SplitView`, belum generik + CSP Batasan #4 |
| `workspace` fs | **Stabil** | Fase 2: `fs.readFile/writeFile/readDirectory/createDirectory/delete/rename/stat` dual delegate `fileService`/`fileIpc` → Tauri `invoke('read_file_text',...)` else in-memory tree Map + `onFileSystemChange` dari mutasi / `watcher_service.rs:346 fs-change` |
| `workspace` configuration | **Stabil** | `getConfiguration(section?).get/has/update` + `onDidChangeConfiguration` `affectsConfiguration` dual delegate `settingsStore`/`settingsIpc` → `db.rs:577` else `configStore` + `configEmitter` |
| `workspace` document/workspace events | **Stabil** | `onDidOpen/Close/Save/ChangeTextDocument` + `onDidChangeWorkspaceFolders` + `onFileSystemChange` via `Emitter` + `__fire*` helper; bridge `eventBus` + `fs-change` |
| `workspace` registerFileSystemProvider | **Stub** | Prioritas rendah (§3.5) — `throw NotImplementedError`, core hanya `TauriFileService` lokal |
| `views` | **Stabil** | Fase 3: `ViewContainer`/`View` CRUD + `TreeDataProvider`/`WebviewViewProvider` real + delegate `activityBarRegistry`/`sidebarRegistry`; declarative `viewsContainers`/`views` via host |
| `menus` | **Stabil** | Fase 3: 13 `MenuLocation` + `evaluateWhenClause` parser lengkap (tokenizer `STRING`/`IDENT` `&&`/`||`/`!`/`==`/`!=`/`=~`/`>`/`<`/`in` + recursive-descent + regex `/.../flags` stripping + truthiness + `getMenus` filter `when`) + `menuContributions` Map |
| `languages` providers (completion/hover/definition/formatting) | **Stub (prioritas tinggi)** | Fase 3: highlighting **sudah modular** (80+ bahasa `languageDetector.ts:LANG_LOADERS` + `languageRegistry` per-bahasa + `Editor.svelte:langCompartment` lazy) — gap hanya provider dinamis `registerCompletionItemProvider` etc disimpan in-memory + `warnStubOnce`, butuh `editorExtensionRegistry`/`Compartment` bridge (lihat IMPLEMENTATION_LOG Fase 3 "Belum modular untuk provider dinamis") |
| `languages` diagnostics/config | **Stabil** | `createDiagnosticCollection` CRUD real (`DiagnosticCollectionImpl` + `Emitter`), `setLanguageConfiguration` real, `matchesSelector`, declarative `languages`/`grammars` |
| `theming` | **Stabil** | Fase 3: `getActiveColorTheme`/`onDidChangeActiveColorTheme` fallback + delegate `THEMES` 51 tema; declarative `themes`/`iconThemes`/`productIconThemes` via host (path belum dynamic import) |
| `debug` | **Stub (prioritas rendah)** | Fase 4: tipe `DebugConfiguration/Session/DescriptorFactory` final; `registerDebugAdapterDescriptorFactory` simpan in-memory + `warnStubOnce`; `startDebugging` `throw NotImplementedError` (core tanpa DAP, hanya `runService`) |
| `tasks` | **Stabil (sebagian)** | Fase 4: `registerTaskProvider` → `taskRegistry.register` (`npm`/`cargo`) real bila delegate, else in-memory; `executeTask` hybrid fallback (`onDidStartTask` → `queueMicrotask` → `onDidEndTask` tanpa shell); `TasksDelegate` bridgeable |
| `scm` | **Stabil (sebagian)** | Fase 4: `createSourceControl` CRUD real (`SourceControlImpl` + `ResourceGroupImpl` inputBox + `resourceStates` setter + `dispose` LIFO) → `scmRegistry` generic (`git`); host wiring ke `SourceControlPanel` gap rendah |
| `snippets` | **Stabil (deklaratif)** | Fase 4: `contributes.snippets` declarative real → `snippetRegistry` data-driven (6 bahasa) + `snippetCompletion.ts` `languageData`; `registerSnippets(helper)` + `validateSnippet` real |
| `authentication` | **Stub (sangat rendah)** | Fase 4: `registerAuthenticationProvider` in-memory + `warnStubOnce`; `getSession` `throw NotImplementedError` — core tanpa auth service |
| `terminal` | **Stabil** | Fase 4: `createTerminal` → `terminalStore.newTerminal` + `tauri-pty` (`TerminalInstance.svelte` spawn) real bila delegate, else `TerminalImpl` CRUD penuh (buffer, `sendText`, `show/hide`, `__getTerminals`); `onDidOpen/CloseTerminal` + profile/link provider |
| `extensions` | **Stabil** | Fase 4: `getExtension`/`all`/`onDidChange` via `ExtensionHost` + fallback `localExtensions` Map |
| `host` `ExtensionContext`/`Memento`/`SecretStorage`/`NotronEventBus`/`ExtensionHost` | **Stabil** | Fase 2+3: context `globalState/workspaceState: Memento` (CRUD + optional `MementoPersistence` file-backed) + `SecretStorage` in-memory warnOnce + `OutputChannel`; `NotronEventBus` 15 `SDK_EVENTS` + `bridgeExternalEvent`; `ExtensionHost` lifecycle sort + isolate + LIFO dispose |
| **CLI** `init`/`build`/`package`/`validate`/`install-local`/`list-templates` | **Stabil** | Fase 5: esbuild `build`/`package`, 6 perintah via `runCli(argv)`, `validate` + file refs, `checksums.json` SHA-256, `bin: notron-sdk/ntrn`, `files: ["dist","src/cli/templates"]`, `tsconfig emitDeclarationOnly:false` |
| **CLI templates** `hello-world` | **Stabil** | Fase 5: full, diuji e2e `init → build → package` (dist 2KB dev / 960B prod, .ntrn 4 file, checksums verified + tamper detection) |
| **CLI templates** `webview-view`/`language-support`/`custom-editor` | **Stub** | Fase 5: folder stub (manifest valid minimal + placeholder `src/extension.ts` + README `stub`) — gap core sama (webview/language provider) |
| **Package** `signature` | **Placeholder** | Fase 5: field `signature?: string` tidak diimplementasi (disisihkan untuk code signing `minisign`/`cosign` rekomendasi lanjutan) |
| **`notron-sdk/testing` (Mock Host)** | **Stabil** | Fase 6: `createMockNotron()` + `createMockContext()` + `resetAllMocks()` in-memory untuk **ke-14 namespace** (boleh sederhana untuk stub — stub tetap `NotImplementedError` yang jelas); introspection `__getShownMessages`, `__getRegisteredCommands`, `__getStatusBarItems`, `__getSourceControls`, dll; dipakai internal untuk sebagian unit test (`NOTRON_SDK_05_TESTING_DX §2`) |

**Deprecated: tidak ada.** Semua API stabil adalah additive; stub akan menjadi stabil saat core menyediakan bridge (lihat Gap Prioritas di `IMPLEMENTATION_LOG.md` Fase 0–5).

---

## 8. Testing & Developer Experience

### Testing untuk SDK Itu Sendiri

`test/` memakai `bun:test` (isolated via `bun test`, bukan `jest`):

- `test/utils.test.ts` (1) — `joinUri`
- `test/manifest.test.ts` (78) — `validateManifest`/`validatePermissions`/`validateActivationEvents` valid & invalid (semver, duplicate, path)
- `test/host.test.ts` (40) — `topologicalSort`/`isCompatible`, `ExtensionHost` lifecycle + error isolation (satu gagal tidak hentikan lain, circular/missing), `Memento`/`SecretStorage`, `NotronEventBus`, `commands`/`window`/`workspace` (fs/config/document events) + hello-world smoke via `ExtensionHost`
- `test/fase3.test.ts` (19) — `views`/`menus` (`evaluateWhenClause` 5 kasus + `getMenus` filter) / `languages` (providers stub + `DiagnosticCollection` + `setLanguageConfiguration` + declarative) / `theming` + `examples/sidebar-counter` & `markdown-preview` smoke
- `test/fase4.test.ts` (28) — `debug` (declarative + factory + throw + events), `tasks` (provider + execute fallback async + fetch), `scm` (createSourceControl CRUD + inputBox + duplicate throw + selected event), `snippets` (declarative + imperative case-insensitive + validate), `authentication` (register + throw + event), `terminal` (create + sendText + events + profile/link), `extensions` + 14-namespace re-export + host contributions Fase 4
- `test/fase5.test.ts` (16) — `computeChecksumSync` vektor `hello → sha256:2cf24dba...` + async `verifyChecksum` + `generateChecksums`, `validate` file refs missing/ok, `list-templates`/`init` hello-world valid & unknown throw, `init→build→package` flow (dist/extension.js ada, `.ntrn` 4 file tanpa `.map`, `checksums.json` 3 entries verified + tamper detection) untuk template `hello-world` dan `examples/hello-world`, `package` fails on invalid (no .ntrn), `install-local` ekstrak ke `tmpDev` + `validate` negative 8 errors
- `test/testing.test.ts` (Fase 6, +34) — Mock Host `createMockNotron`/`createMockContext` untuk **ke-14 namespace**: commands register/execute/isolate, window notifications/status/output/tabs/custom-editor stub throw, workspace fs/config/document/provider stub, views/menus/languages/theming/debug stub/tasks/scm/snippets/authentication/terminal/extensions + reset + integration spec example `myExtension.activate` → `executeCommand` → `__getShownMessages` + hello-world smoke via mock

Total **216 pass, 0 fail, 542 expect()** (7 files). Karena batas read-only core, tidak ada test yang menjalankan Notron sungguhan — sebatas SDK standalone (rekomendasi lanjutan: e2e dengan Notron berjalan).

### Utilitas Testing untuk Penulis Ekstensi — `notron-sdk/testing`

Sub-entry terpisah (`package.json:exports "./testing"` → `dist/testing/*`, `tsconfig paths: notron-sdk/testing`):

```ts
import { createMockNotron, createMockContext } from 'notron-sdk/testing';
// atau relative saat dev SDK: import { createMockNotron } from '../src/testing/index.js';

const notron = createMockNotron(); // in-memory 14 namespace + __ helpers
const ctx = createMockContext('acme.demo');

await myExtension.activate(ctx as never);
await notron.commands.executeCommand('acme.demo.sayHello');
expect(notron.window.__getShownMessages().some(m => m.message === 'Hello!')).toBe(true);

// introspection lain:
notron.commands.__getRegisteredCommands(); // alias __getRegisteredIds
notron.window.__getStatusBarItems();
notron.workspace.__getFsEntries();
notron.views.__getViewContainers();
notron.languages.__getDeclaredLanguages();
notron.terminal.__getTerminals();
notron.scm.__getSourceControls();

// reset antar test:
notron.__resetAll(); // atau resetAllMocks()
ctx.dispose(); // LIFO subscriptions
```

Dipakai juga secara internal oleh SDK untuk sebagian unit test di atas.

### Lint & Type Checking

- `tsconfig.json` `strict: true` penuh (`noImplicitAny`, `strictNullChecks`, `noUnusedLocals/Params`, `isolatedModules`, `emitDeclarationOnly: false` (butuh JS untuk CLI bin), `declarationMap`).
- Lint: `ESLint 8.57` + `@typescript-eslint/parser` 6.21 + `plugin` 6.21, config `.eslintrc.cjs` (`eslint:recommended` + `typescript-eslint/recommended`, `no-console` off, `prefer-const` warn, ignore `dist`/`templates`). Script `bun run lint` (`eslint src test --ext .ts`) — **harus 0 errors** (warnings diperbolehkan, tapi saat ini 0 warnings setelah fix `prefer-const`/`no-constant-condition`).
- Script: `typecheck` (`tsc --noEmit`), `lint` (`eslint src test --ext .ts`), `test` (`bun test`), `build` (`tsc -p tsconfig.json`). Semua harus lolos sebelum fase dianggap selesai (kriteria keluar Fase 6).

### Contoh Ekstensi Referensi (`packages/notron-sdk/examples/`)

Berada di `packages/notron-sdk/examples/` (bukan `examples/` root monorepo — dibatasi **HANYA `packages/notron-sdk` boleh tulis** per instruksi tugas; root `examples/` tidak dibuat agar tidak melanggar read-only). Berfungsi ganda sebagai dokumentasi hidup + smoke test manual (dijalankan via `ExtensionHost` di test):

- `examples/hello-world/` — satu command `acme.helloWorld` → `showInformationMessage` + `workspace.fs.writeFile/readFile` + `tabGroups.openTab` + `OutputChannel` + `StatusBarItem` + `globalState` + events. Dibangun `notron-sdk build/package` menghasilkan `.ntrn` valid (diuji Fase 5).
- `examples/markdown-preview/` — custom editor/preview sederhana (memvalidasi `languages` + `menus` + `theming` + stub `window.registerCustomEditorProvider`/`createWebviewPanel` → fallback `OutputChannel`). Manifest `onLanguage:markdown`, `menus.editor/title` `when: editorTextFocus && resourceExtname == .md`, `languages` `markdown-preview-demo`, `grammars`, `themes` `acme.preview-dark`, `configuration`.
- `examples/sidebar-counter/` — Webview View di sidebar dengan state sederhana (memvalidasi `views` + `Memento` + `menus`). Manifest `viewsContainers: acme.counterContainer`, `views: acme.sidebarCounterView` (webview) + `acme.counterTree` (tree), `TreeDataProvider` `Counter: N` + `WebviewViewProvider` `increment`/`reset` via `postMessage` + `globalState.counter`.

Setiap contoh punya `README.md` singkat menjelaskan API yang didemonstrasikan.

---

## 9. Contributing

```bash
bun install
bun run typecheck   # tsc --noEmit, harus 0 errors
bun run lint        # eslint src test --ext .ts, harus 0 errors
bun test            # bun:test, 216 pass
bun run build       # tsc → dist + .d.ts + .js (CLI bin)
```

Menambah template CLI baru: tambah folder `src/cli/templates/<nama>/` berisi `manifest.json` (valid minimal, id `publisher.name`, divalidasi `validateManifest`), `src/extension.ts` (export `activate`/`deactivate`), `package.json` (`notron-sdk ^0.1.0`), `tsconfig.json`, `gitignore` → `.gitignore`, `README.md`. Daftarkan di `getTemplatesDir`/`listTemplatesSync` (otomatis via `fs.readdir`). Template selain `hello-world` boleh stub dengan catatan di `IMPLEMENTATION_LOG.md`.

Versioning: SDK mengikuti semver sendiri terpisah dari Notron app (`CHANGELOG.md`), tapi `engines.notron` di tiap ekstensi menyatakan kompatibilitas dengan Notron.

---

## License

MIT
