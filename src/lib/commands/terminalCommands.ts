/**
 * Terminal Commands
 *
 * Registers terminal panel commands as proper commands.
 * All terminal UI triggers go through commandRegistry.
 */

import { commandRegistry } from './registry';
import { terminalStore } from '../stores/terminal';
import { uiStore } from '../stores/ui';

function reg(id: string, label: string, category: string, action: (...args:any[])=>any) { if (!commandRegistry.has(id)) commandRegistry.register({ id, label, category, action }); }
reg('workbench.action.terminal.new', 'Terminal: Create New Terminal', 'Terminal', () => {
  const cwd = uiStore.getSnapshot().explorerRoot || '';
  terminalStore.newTerminal(undefined, cwd);
});
reg('workbench.action.terminal.toggleTerminal', 'View: Toggle Terminal', 'View', () => {
  const snap = terminalStore.getSnapshot();
  if (snap.terminals.length === 0) {
    const cwd = uiStore.getSnapshot().explorerRoot || '';
    terminalStore.newTerminal(undefined, cwd);
  } else {
    terminalStore.setVisibility(!snap.isVisible);
  }
});
reg('workbench.action.terminal.killActive', 'Terminal: Kill Active Terminal', 'Terminal', () => {
  const snap = terminalStore.getSnapshot();
  if (snap.activeTerminalId) terminalStore.closeTerminal(snap.activeTerminalId);
});
reg('workbench.action.terminal.clear', 'Terminal: Clear Output', 'Terminal', () => {
  terminalStore.clearOutput();
});
reg('workbench.action.terminal.maximize', 'Terminal: Maximize Panel', 'View', () => {
  terminalStore.toggleMaximize();
});
reg('workbench.action.terminal.show', 'Terminal: Show Terminal', 'View', () => {
  terminalStore.setActivePanel('terminal');
  terminalStore.setVisibility(true);
});
reg('workbench.action.terminal.hide', 'Terminal: Hide Panel', 'View', () => {
  terminalStore.setVisibility(false);
});
reg('workbench.actions.view.problems', 'View: Problems', 'View', () => {
  terminalStore.setActivePanel('problems');
  terminalStore.setVisibility(true);
});
reg('workbench.actions.view.output', 'View: Output', 'View', () => {
  terminalStore.setActivePanel('output');
  terminalStore.setVisibility(true);
});
