# sidebar-counter — notron-sdk Fase 3 smoke test (views)

Exercises Fase 3 `views` + `menus` + `theming`:

- `contributes.viewsContainers` / `contributes.views` — read via `views.getContainer` / `getView` / `getViews` (host/contributions)
- `views.registerTreeDataProvider` — tree view `acme.counterTree` with `onDidChangeTreeData` → `changeEmitter.fire()`
- `views.registerWebviewViewProvider` — webview view `acme.sidebarCounterView` with html + `onDidReceiveMessage({type:'increment'|'reset'})`
- `menus.evaluateWhenClause` — checks `view == acme.sidebarCounterView` visibility
- `theming.getActiveColorTheme` / `onDidChangeActiveColorTheme`
- `commands` + `Memento` (`globalState.counter`)

## Run (standalone, without Notron)

```bash
# from packages/notron-sdk
bun test                  # host lifecycle tests include sidebar-counter via ExtensionHost (see test/host.test.ts)
bunx tsc --noEmit
```

The extension is wired via `ExtensionHost` in tests: manifest → `registerManifestContributions` → providers stored in fallback maps — no core needed.

## Run inside Notron (once loader + sidebarRegistry bridge exists)

1. `bun run build` (SDK)
2. `cd examples/sidebar-counter && bun run build`
3. `notron-sdk package` (Fase 5) → `.ntrn`
4. Install dev extension & launch Notron.

Expected: Activity Bar shows "Counter" container; sidebar has two views: webview counter (html with Increment/Reset) and tree counter (`Counter: N` with context menu `Reset Counter`). View title menu shows `Increment Counter`.

## What to observe

- Activation logs `container=Counter webview=Counter tree=Counter Tree` and theme `vscode-dark (dark)`.
- `evaluateWhenClause` logs `ok=true fail=false`.
- Command `Counter: Increment Counter` increments `globalState.counter`, fires tree refresh, updates webview html.
