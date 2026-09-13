/**
 * Sidebar Counter — smoke test Phase 3 views
 *
 * Exercises:
 *  - declarative viewsContainers / views via manifest (read via views.getContainer / getView)
 *  - views.registerTreeDataProvider (CRUD + onDidChangeTreeData)
 *  - views.registerWebviewViewProvider (webview html + message passing)
 *  - menus.evaluateWhenClause (checked indirectly via contributes.menus when)
 *  - commands + theming.getActiveColorTheme
 */

import { commands } from '../../../src/api/commands.js';
import { views } from '../../../src/api/views.js';
import { window } from '../../../src/api/window.js';
import { menus } from '../../../src/api/menus.js';
import { theming } from '../../../src/api/theming.js';
import type { ExtensionContext } from '../../../src/host/context.js';
import { Emitter } from '../../../src/api/types.js';

interface CounterItem {
  id: string;
  label: string;
  count: number;
}

function getHtml(count: number, themeId: string): string {
  return `<!doctype html><html><body style="padding:12px;font-family:sans-serif">
  <h3>Counter: ${count}</h3>
  <p>Theme: ${themeId}</p>
  <button onclick="vscode.postMessage({type:'increment'})">Increment</button>
  <button onclick="vscode.postMessage({type:'reset'})">Reset</button>
  </body></html>`;
}

export async function activate(context: ExtensionContext): Promise<void> {
  const log = context.logChannel;
  log.appendLine('[sidebar-counter] activating…');

  // -- Verify declarative contributions are readable (host/contributions must have registered them)
  const container = views.getContainer('acme.counterContainer');
  const webviewView = views.getView('acme.sidebarCounterView');
  const treeView = views.getView('acme.counterTree');
  log.appendLine(`[sidebar-counter] container=${container?.title ?? 'missing'} webview=${webviewView?.name ?? 'missing'} tree=${treeView?.name ?? 'missing'}`);
  if (!container || !webviewView || !treeView) {
    log.appendLine('[sidebar-counter] WARNING: declarative views not found — host may not have processed contributes yet');
  }

  // -- theming smoke.
  const theme = theming.getActiveColorTheme();
  log.appendLine(`[sidebar-counter] active theme: ${theme.id} (${theme.kind})`);
  const themeDisp = theming.onDidChangeActiveColorTheme((t) => {
    log.appendLine(`[sidebar-counter] theme changed -> ${t.id}`);
  });
  context.subscriptions.push(themeDisp);

  // -- menus smoke: evaluateWhenClause.
  const whenOk = menus.evaluateWhenClause('view == acme.sidebarCounterView', { view: 'acme.sidebarCounterView' });
  const whenFail = menus.evaluateWhenClause('view == acme.sidebarCounterView && editorTextFocus', { view: 'other', editorTextFocus: false });
  log.appendLine(`[sidebar-counter] evaluateWhenClause ok=${whenOk} fail=${whenFail}`);

  // -- State (Memento)
  let count = (await context.globalState.get<number>('counter', 0)) ?? 0;

  // -- TreeDataProvider for acme.counterTree.
  const changeEmitter = new Emitter<CounterItem | undefined>();
  const treeProvider = {
    onDidChangeTreeData: changeEmitter.event,
    getTreeItem(element: CounterItem) {
      return {
        label: element.label,
        description: `value: ${element.count}`,
        contextValue: 'counterItem',
        command: 'acme.sidebarCounter.increment',
      };
    },
    getChildren(element?: CounterItem) {
      if (element) return [];
      return [{ id: 'counter', label: `Counter: ${count}`, count }];
    },
  };
  const treeDisp = views.registerTreeDataProvider('acme.counterTree', treeProvider as never);
  context.subscriptions.push(treeDisp);
  context.subscriptions.push({ dispose() { changeEmitter.dispose(); } });

  // -- WebviewViewProvider for acme.sidebarCounterView.
  // The SDK's views provider uses a simple webview abstraction: { webview: { html, postMessage, onDidReceiveMessage } }
  // For fallback we simulate via in-memory; real host would render in sidebar.
  const webviewProvider = {
    async resolveWebviewView(webviewViewObj: { webview: { html: string; postMessage(m: unknown): Promise<boolean>; onDidReceiveMessage(cb: (msg: unknown) => void): { dispose(): void } } }) {
      webviewViewObj.webview.html = getHtml(count, theme.id);
      const disp = webviewViewObj.webview.onDidReceiveMessage((msg: unknown) => {
        const m = msg as { type: string };
        if (m.type === 'increment') {
          count++;
          void context.globalState.update('counter', count);
          webviewViewObj.webview.html = getHtml(count, theming.getActiveColorTheme().id);
          changeEmitter.fire(undefined);
          log.appendLine(`[sidebar-counter] webview increment -> ${count}`);
        } else if (m.type === 'reset') {
          count = 0;
          void context.globalState.update('counter', count);
          webviewViewObj.webview.html = getHtml(count, theming.getActiveColorTheme().id);
          changeEmitter.fire(undefined);
          log.appendLine('[sidebar-counter] webview reset -> 0');
        }
      });
      context.subscriptions.push(disp as never);
      log.appendLine('[sidebar-counter] webview resolved');
    },
  };
  const webviewDisp = views.registerWebviewViewProvider('acme.sidebarCounterView', webviewProvider as never);
  context.subscriptions.push(webviewDisp);

  // -- Commands.
  const inc = commands.registerCommand('acme.sidebarCounter.increment', async () => {
    count++;
    await context.globalState.update('counter', count);
    changeEmitter.fire(undefined);
    log.appendLine(`[sidebar-counter] command increment -> ${count}`);
    const out = window.createOutputChannel('Sidebar Counter');
    out.appendLine(`Count is now ${count}`);
  }, context.extensionId);
  const reset = commands.registerCommand('acme.sidebarCounter.reset', async () => {
    count = 0;
    await context.globalState.update('counter', count);
    changeEmitter.fire(undefined);
    log.appendLine('[sidebar-counter] command reset -> 0');
  }, context.extensionId);
  context.subscriptions.push(inc, reset);

  // -- Output channel smoke.
  const out = window.createOutputChannel('Sidebar Counter');
  context.subscriptions.push(out);
  out.appendLine(`[sidebar-counter] activated count=${count}`);

  log.appendLine('[sidebar-counter] activated OK');
}

export async function deactivate(): Promise<void> {
  console.log('[sidebar-counter] deactivated');
}
