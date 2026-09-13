# hello-world — notron-sdk smoke test (Fase 2)

Exercises the Fase 2 API surface:

- `commands.registerCommand` / `executeCommand` / `getCommands` — registers `acme.helloWorld`, verifies listing
- `window.showInformationMessage` — shows greeting, handles `Show Output` action
- `window.createStatusBarItem` — CRUD (create, set text/tooltip/command, show, dispose via context)
- `window.createOutputChannel` — append/appendLine/show/clear/dispose
- `window.tabGroups` — openTab, activeTab, onDidChangeActiveTab / onDidChangeTabGroups
- `window.activeTextEditor` / `visibleTextEditors` — read from fallback stores
- `workspace.fs` — writeFile/readFile/readDirectory/createDirectory/delete/rename/stat (in-memory fallback, bridges to `fileService`/`fileIpc` when host injects delegate)
- `workspace.getConfiguration` / `update` / `onDidChangeConfiguration` — in-memory config store
- `workspace.onDidOpenTextDocument` / `onDidCloseTextDocument` / `onDidSaveTextDocument` / `onDidChangeTextDocument`
- `workspace.onDidChangeWorkspaceFolders` / `onFileSystemChange`
- `ExtensionContext` — `globalState`/`workspaceState` (Memento), `secrets`, `logChannel`, `subscriptions` LIFO dispose
- `NotronEventBus` + error isolation — bad listeners do not break others; activation errors do not block other extensions

## Run (manual, without Notron running)

```bash
# from packages/notron-sdk
bun test                  # runs host lifecycle tests that also exercise hello-world via ExtensionHost
bunx tsc --noEmit         # typechecks SDK
```

## Run inside Notron (once loader exists)

1. Build SDK: `bun run build` (emits `dist/`)
2. Build example: `cd examples/hello-world && bun run build`
3. Package (Fase 5): `notron-sdk package` → `.ntrn`
4. Install to dev folder and launch Notron with that folder on `extensions` path.

## What to observe

- On activation: status bar shows `$(smiley) Hello`, Output Channel `Hello World` logs activation count and theme.
- Command Palette → `Acme: Hello World` → notification `Hello from Notron!` with `OK`, `Show Output`; picking `Show Output` reveals the channel.
- The command also writes `/hello.txt` and opens it as a new tab — verify via `workspace.fs.readFile` log and `tabGroups` event.
