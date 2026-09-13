# markdown-preview — notron-sdk Fase 3 smoke test (languages + menus + theming)

Exercises Fase 3 middle APIs:

- `contributes.languages` / `grammars` / `themes` / `menus` / `configuration` — declared in `manifest.json` and read via `host/registerManifestContributions` (also validated by `validateManifest`)
- `languages.registerHoverProvider` / `registerCompletionItemProvider` (per-markdown, stored in fallback registry — high-priority stub until CodeMirror bridge)
- `languages.createDiagnosticCollection` — real CRUD (`set`/`get`/`has`/`delete`/`clear`/`dispose`)
- `languages.setLanguageConfiguration` — per-language brackets/comments
- `menus.evaluateWhenClause` — `editorTextFocus && resourceExtname == .md`, parens, `view == explorer`, negation
- `theming.getActiveColorTheme` / `onDidChangeActiveColorTheme`
- `window.registerCustomEditorProvider` / `createWebviewPanel` — typed stubs (throw `NotImplementedError` until core webview host exists; smoke handles gracefully)

## Run (standalone)

```bash
# from packages/notron-sdk
bun test            # also exercises this example via ExtensionHost
bunx tsc --noEmit
```

`ExtensionHost` processes `contributes` declaratively; no Notron core needed.

## Run inside Notron (once webview & language bridges exist)

1. `bun run build` (SDK)
2. `cd examples/markdown-preview && bun run build`
3. `notron-sdk package` (Fase 5) → `.ntrn`

Expected:

- Activation logs `activeTheme=vscode-dark kind=dark` and `when visible=true hidden=false`.
- Hover provider for `markdown` is registered (in-memory); diagnostic collection contains 1 entry for `file:///workspace/README.md`.
- Command `Markdown: Toggle Markdown Preview` is available; its `editor/title` menu item appears only when `resourceExtname == .md` (checked via `evaluateWhenClause`).
- Invoking the command hits the `window.createWebviewPanel` stub → falls back to Output Channel `Markdown Preview` with preview message (until core implements CSP webview host per `NOTRON_MODULARITY_MAP` Batasan #4).

## What to observe in logs

- `setLanguageConfiguration markdown done`
- `hoverProvider registered for markdown`
- `diags for README.md = 1`
- `customEditor stub (expected): [notron-sdk] Not implemented: window.registerCustomEditorProvider`
- On toggle: `Toggle preview — theme=vscode-dark whenVisible=true diags=1` + InformationMessage + Output Channel fallback.
