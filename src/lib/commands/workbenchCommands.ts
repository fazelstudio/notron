/**
 * Workbench Commands
 *
 * Registers workbench commands for menus, palette, and keys.
 */

import { commandRegistry } from './registry';
import type { Command } from './registry';

export function registerWorkbenchCommands(ctx: {
 // Actions — injected to avoid circular imports and keep this part pure
  newUntitledFile: () => void;
  newFileDialog: () => void;
  newWindow: () => Promise<void>;
  openFile: () => Promise<void>;
  openFolder: () => Promise<void>;
  openRecent: () => void;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  closeActiveTab: () => void;
  closeAllTabsInActivePane: () => void;
  reopenClosedTab: () => void;
  toggleSidebar: () => void;
  showExplorer: () => void;
  showSearch: () => void;
  showSourceControl: () => void;
  showRun: () => void;
  showCommands: () => void;
  quickOpen: () => void;
  gotoLine: () => void;
  navigateBack: () => void | Promise<void>;
  navigateForward: () => void | Promise<void>;
  findInFiles: () => void;
  replaceInFiles: () => void;
  openSettings: () => void;
  openTerminal: () => void;
  newTerminal: () => void;
  showProblems: () => void;
  showOutput: () => void;
  toggleMinimap: () => void;
  toggleBreadcrumbs: () => void;
  toggleStickyScroll: () => void;
  toggleStatusBar: () => void;
  undo: () => void;
  redo: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  selectAll: () => void;
  copyLineUp: () => void;
  copyLineDown: () => void;
  moveLineUp: () => void;
  moveLineDown: () => void;
  find: () => void;
  replace: () => void;
}): void {
  const cmds: Command[] = [
 // File
    { id: 'workbench.action.files.newUntitledFile', label: 'File: New Untitled File', category: 'File', shortcut: 'Ctrl+N', action: ctx.newUntitledFile },
    { id: 'workbench.action.files.newFile', label: 'File: New File…', category: 'File', action: ctx.newFileDialog },
    { id: 'workbench.action.newWindow', label: 'File: New Window', category: 'File', shortcut: 'Ctrl+Shift+N', action: ctx.newWindow },
    { id: 'workbench.action.files.openFile', label: 'File: Open File…', category: 'File', shortcut: 'Ctrl+O', action: ctx.openFile },
    { id: 'workbench.action.files.openFolder', label: 'File: Open Folder…', category: 'File', action: ctx.openFolder },
    { id: 'workbench.action.openRecent', label: 'File: Open Recent…', category: 'File', action: ctx.openRecent },
    { id: 'workbench.action.files.save', label: 'File: Save', category: 'File', shortcut: 'Ctrl+S', action: ctx.save },
    { id: 'workbench.action.files.saveAs', label: 'File: Save As…', category: 'File', shortcut: 'Ctrl+Shift+S', action: ctx.saveAs },
    // `workbench.action.files.save` already registered as `workbench.action.save` in App.svelte — alias kept for compatibility
    { id: 'workbench.action.closeActiveEditor', label: 'View: Close Editor', category: 'View', shortcut: 'Ctrl+W', action: ctx.closeActiveTab },
    { id: 'workbench.action.closeAllEditors', label: 'View: Close All Editors', category: 'View', action: ctx.closeAllTabsInActivePane },
    { id: 'workbench.action.reopenClosedEditor', label: 'View: Reopen Closed Editor', category: 'View', shortcut: 'Ctrl+Shift+T', action: ctx.reopenClosedTab },

 // View
    { id: 'workbench.action.toggleSidebarVisibility', label: 'View: Toggle Primary Side Bar', category: 'View', shortcut: 'Ctrl+B', action: ctx.toggleSidebar },
    { id: 'workbench.view.explorer', label: 'View: Show Explorer', category: 'View', shortcut: 'Ctrl+Shift+E', action: ctx.showExplorer },
    { id: 'workbench.view.search', label: 'View: Show Search', category: 'View', shortcut: 'Ctrl+Shift+F', action: ctx.showSearch },
    { id: 'workbench.view.scm', label: 'View: Show Source Control', category: 'View', shortcut: 'Ctrl+Shift+G', action: ctx.showSourceControl },
    { id: 'workbench.view.debug', label: 'View: Show Run and Debug', category: 'View', shortcut: 'Ctrl+Shift+D', action: ctx.showRun },
    { id: 'workbench.action.showCommands', label: 'View: Show All Commands', category: 'View', shortcut: 'Ctrl+Shift+P', action: ctx.showCommands },
    { id: 'workbench.action.quickOpen', label: 'View: Quick Open', category: 'View', shortcut: 'Ctrl+P', action: ctx.quickOpen },
    { id: 'workbench.action.gotoLine', label: 'View: Go to Line', category: 'View', shortcut: 'Ctrl+G', action: ctx.gotoLine },
    { id: 'workbench.action.terminal.new', label: 'Terminal: Create New Terminal', category: 'Terminal', shortcut: 'Ctrl+Shift+`', action: ctx.newTerminal },
    { id: 'workbench.action.terminal.toggleTerminal', label: 'View: Toggle Terminal', category: 'View', shortcut: 'Ctrl+`', action: ctx.openTerminal },
    { id: 'workbench.actions.view.problems', label: 'View: Problems', category: 'View', action: ctx.showProblems },
    { id: 'workbench.actions.view.output', label: 'View: Output', category: 'View', action: ctx.showOutput },
    { id: 'workbench.action.toggleMinimap', label: 'View: Toggle Minimap', category: 'View', action: ctx.toggleMinimap },
    { id: 'workbench.action.toggleBreadcrumbs', label: 'View: Toggle Breadcrumbs', category: 'View', action: ctx.toggleBreadcrumbs },
    { id: 'workbench.action.toggleStickyScroll', label: 'View: Toggle Sticky Scroll', category: 'View', action: ctx.toggleStickyScroll },
    { id: 'workbench.action.toggleStatusbarVisibility', label: 'View: Toggle Status Bar', category: 'View', action: ctx.toggleStatusBar },

 // Edit
    { id: 'editor.action.undo', label: 'Undo', category: 'Edit', shortcut: 'Ctrl+Z', action: ctx.undo },
    { id: 'editor.action.redo', label: 'Redo', category: 'Edit', shortcut: 'Ctrl+Y', action: ctx.redo },
    { id: 'editor.action.clipboardCutAction', label: 'Cut', category: 'Edit', shortcut: 'Ctrl+X', action: ctx.cut },
    { id: 'editor.action.clipboardCopyAction', label: 'Copy', category: 'Edit', shortcut: 'Ctrl+C', action: ctx.copy },
    { id: 'editor.action.clipboardPasteAction', label: 'Paste', category: 'Edit', shortcut: 'Ctrl+V', action: ctx.paste },
    { id: 'editor.action.selectAll', label: 'Select All', category: 'Selection', shortcut: 'Ctrl+A', action: ctx.selectAll },
    { id: 'editor.action.copyLinesDownAction', label: 'Copy Line Down', category: 'Selection', shortcut: 'Shift+Alt+Down', action: ctx.copyLineDown },
    { id: 'editor.action.copyLinesUpAction', label: 'Copy Line Up', category: 'Selection', shortcut: 'Shift+Alt+Up', action: ctx.copyLineUp },
    { id: 'editor.action.moveLinesDownAction', label: 'Move Line Down', category: 'Selection', shortcut: 'Alt+Down', action: ctx.moveLineDown },
    { id: 'editor.action.moveLinesUpAction', label: 'Move Line Up', category: 'Selection', shortcut: 'Alt+Up', action: ctx.moveLineUp },
    { id: 'actions.find', label: 'Find', category: 'Edit', shortcut: 'Ctrl+F', action: ctx.find },
    { id: 'editor.action.startFindReplaceAction', label: 'Replace', category: 'Edit', shortcut: 'Ctrl+H', action: ctx.replace },
    { id: 'workbench.action.findInFiles', label: 'Search: Find in Files', category: 'Search', shortcut: 'Ctrl+Shift+F', action: ctx.findInFiles },
    { id: 'workbench.action.replaceInFiles', label: 'Search: Replace in Files', category: 'Search', shortcut: 'Ctrl+Shift+H', action: ctx.replaceInFiles },

 // Navigation
    { id: 'workbench.action.navigateBack', label: 'Go Back', category: 'Go', shortcut: 'Alt+Left', action: ctx.navigateBack },
    { id: 'workbench.action.navigateForward', label: 'Go Forward', category: 'Go', shortcut: 'Alt+Right', action: ctx.navigateForward },
    { id: 'workbench.action.navigateToLine', label: 'Go to Line', category: 'Go', shortcut: 'Ctrl+G', action: ctx.gotoLine }
  ];

  for (const c of cmds) {
    // Avoid overwriting already-registered base commands (App.svelte core)
    if (!commandRegistry.has(c.id)) commandRegistry.register(c);
  }
}