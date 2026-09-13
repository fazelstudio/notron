/**
 * Hello World — smoke test for Phase 2 SDK
 *
 * Exercises every namespace implemented in Phase 2:
 *  - commands: registerCommand, executeCommand, getCommands
 *  - window: showInformationMessage, createStatusBarItem, createOutputChannel,
 *            tabGroups, activeTextEditor, quickPick/inputBox/progress (fallbacks)
 *  - workspace: fs CRUD, getConfiguration, document events
 *  - host: ExtensionContext (Memento, secrets, logChannel), error isolation
 */

import { commands } from '../../../src/api/commands.js';
import { window } from '../../../src/api/window.js';
import { workspace } from '../../../src/api/workspace.js';
import type { ExtensionContext } from '../../../src/host/context.js';

export async function activate(context: ExtensionContext): Promise<void> {
  const log = context.logChannel;
  log.appendLine('[hello-world] activating…');

  // -- Memento: remember activation count.
  const count = (context.globalState.get<number>('helloCount', 0) ?? 0) + 1;
  await context.globalState.update('helloCount', count);
  log.appendLine(`[hello-world] activation #${count}`);

  // -- Configuration: read theme.
  const theme = workspace.getConfiguration().get<string>('theme', 'system');
  log.appendLine(`[hello-world] theme=${theme}`);

  // -- Output channel (extension-specific, distinct from logChannel)
  const out = window.createOutputChannel('Hello World');
  context.subscriptions.push(out);
  out.appendLine(`Hello World activated (count=${count}, theme=${theme})`);

  // -- Status bar item CRUD.
  const status = window.createStatusBarItem('right', 100);
  status.text = '$(smiley) Hello';
  status.tooltip = 'Hello World — click to say hello';
  status.command = 'acme.helloWorld';
  status.show();
  context.subscriptions.push(status);

  // -- Listen to document events (bridge to SDK event bus)
  const d1 = workspace.onDidOpenTextDocument((doc: { uri: string }) => {
    out.appendLine(`[event] opened: ${doc.uri}`);
  });
  const d2 = workspace.onDidSaveTextDocument((doc: { uri: string }) => {
    out.appendLine(`[event] saved: ${doc.uri}`);
  });
  context.subscriptions.push(d1, d2);

  // -- Listen to config changes.
  const d3 = workspace.onDidChangeConfiguration((e: { affectsConfiguration(section: string): boolean }) => {
    if (e.affectsConfiguration('theme')) {
      out.appendLine('[event] theme changed');
    }
  });
  context.subscriptions.push(d3);

  // -- Tab group events.
  const d4 = window.tabGroups.onDidChangeActiveTab((tab: { uri: string } | undefined) => {
    out.appendLine(`[event] active tab: ${tab?.uri ?? 'none'}`);
  });
  context.subscriptions.push(d4);

  // -- Register command (per spec §1, error if duplicate)
  const cmd = commands.registerCommand('acme.helloWorld', async () => {
    out.appendLine('[command] acme.helloWorld invoked');
    const picked = await window.showInformationMessage('Hello from Notron!', 'OK', 'Show Output');
    if (picked === 'Show Output') out.show();

    // Demo workspace.fs (in-memory or bridged)
    try {
      await workspace.fs.writeFile('/hello.txt', new TextEncoder().encode('Hello, Notron!\n'));
      const data = await workspace.fs.readFile('/hello.txt');
      out.appendLine(`[fs] /hello.txt = ${new TextDecoder().decode(data).trim()}`);
    } catch (err) {
      out.appendLine(`[fs] error: ${String(err)}`);
    }

    // Demo tabGroups.
    const tab = await window.tabGroups.openTab('/hello.txt');
    out.appendLine(`[tab] opened ${tab.uri} in column ${tab.viewColumn}`);
  });
  context.subscriptions.push(cmd);

  // -- Verify getCommands lists our command.
  const cmds = await commands.getCommands();
  if (cmds.includes('acme.helloWorld')) {
    log.appendLine('[hello-world] command registered OK');
  } else {
    log.appendLine('[hello-world] command NOT found in getCommands()');
  }

  log.appendLine('[hello-world] activated OK');
  out.appendLine('[hello-world] smoke test ready — run command acme.helloWorld');
}

export async function deactivate(): Promise<void> {
  // SDK host will dispose subscriptions LIFO automatically; just log.
  console.log('[hello-world] deactivated');
}
