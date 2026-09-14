/**
 * Core Commands
 *
 * Registers core application commands.
 * Each command has a stable id and is invoked from palette, menus, or keys.
 */

import { commandRegistry } from './registry';
import type { PaletteItem } from '../stores/palette';

export interface CoreCommandContext {
  // File / window actions.
  handleNewTextFile: () => void;
  openSettings: () => void;
  openGoToLine: () => void;
  navigateBack: () => void | Promise<void>;
  navigateForward: () => void | Promise<void>;
  runSelected: () => void | Promise<unknown>;
  runCurrentFile: () => void | Promise<unknown>;
  stopRuns: () => void | Promise<unknown>;
  reloadWindow: () => void;
  closeWindow: () => void;
  closeWorkspace: () => void;
  // Explorer palette helpers (trigger FileTree inline creation via events)
  createFile: () => void;
  createFolder: () => void;
  refreshExplorer: () => void;
  collapseExplorer: () => void;
  // UI toggles (optional, for palette completeness)
  toggleSidebar: () => void;
  installExtension: () => void | Promise<void>;
  uninstallExtension: () => void | Promise<void>;
}

/** Register core commands and return palette items. */
export function registerCoreCommands(ctx: CoreCommandContext): PaletteItem[] {
  const items: PaletteItem[] = [
    {
      id: 'workbench.action.newUntitledFile',
      label: 'New File',
      category: 'command',
      shortcut: 'Ctrl+N',
      action: ctx.handleNewTextFile,
      keywords: ['create', 'new file'],
    },
    {
      id: 'workbench.action.toggleSidebar',
      label: 'Toggle Sidebar',
      category: 'command',
      shortcut: 'Ctrl+B',
      action: () => ctx.toggleSidebar(),
    },
    {
      id: 'workbench.action.extensions.install',
      label: 'Extensions: Install from .ntrn…',
      category: 'command',
      action: () => ctx.installExtension(),
      keywords: ['extension', 'install', 'ntrn', 'package'],
    },
    {
      id: 'workbench.action.extensions.uninstall',
      label: 'Extensions: Uninstall…',
      category: 'command',
      action: () => ctx.uninstallExtension(),
      keywords: ['extension', 'remove', 'uninstall'],
    },
    {
      id: 'workbench.action.openSettings',
      label: 'Settings',
      category: 'command',
      shortcut: 'Ctrl+,',
      action: ctx.openSettings,
    },
    {
      id: 'workbench.action.gotoLine',
      label: 'Go to Line',
      category: 'command',
      shortcut: 'Ctrl+G',
      action: () => ctx.openGoToLine(),
    },
    {
      id: 'workbench.action.navigateBack',
      label: 'Go Back',
      category: 'command',
      shortcut: 'Alt+Left',
      action: () => ctx.navigateBack(),
      keywords: ['navigate', 'back', 'history'],
    },
    {
      id: 'workbench.action.navigateForward',
      label: 'Go Forward',
      category: 'command',
      shortcut: 'Alt+Right',
      action: () => ctx.navigateForward(),
      keywords: ['navigate', 'forward', 'history'],
    },
    {
      id: 'workbench.action.run',
      label: 'Run: Start Configuration',
      category: 'command',
      shortcut: 'F5',
      action: () => ctx.runSelected(),
      keywords: ['run', 'launch', 'debug', 'terminal'],
    },
    {
      id: 'workbench.action.runCurrentFile',
      label: 'Run: Current File',
      category: 'command',
      shortcut: 'Ctrl+F5',
      action: () => ctx.runCurrentFile(),
      keywords: ['run', 'current file', 'execute'],
    },
    {
      id: 'workbench.action.stopRun',
      label: 'Run: Stop',
      category: 'command',
      shortcut: 'Shift+F5',
      action: () => ctx.stopRuns(),
      keywords: ['stop', 'kill', 'terminate'],
    },
    {
      id: 'workbench.action.reloadWindow',
      label: 'Developer: Reload Window',
      category: 'command',
      action: ctx.reloadWindow,
      keywords: ['reload', 'refresh', 'restart', 'window'],
    },
    {
      id: 'workbench.action.closeWindow',
      label: 'File: Close Window',
      category: 'command',
      action: ctx.closeWindow,
      keywords: ['close', 'exit', 'window', 'quit'],
    },
    {
      id: 'workbench.action.closeFolder',
      label: 'File: Close Folder',
      category: 'command',
      action: ctx.closeWorkspace,
      keywords: ['close', 'folder', 'workspace', 'remove'],
    },
    {
      id: 'workbench.action.closeWorkspace',
      label: 'File: Close Workspace',
      category: 'command',
      action: ctx.closeWorkspace,
      keywords: ['close', 'workspace', 'folder'],
    },
    {
      id: 'workbench.action.explorer.newFile',
      label: 'Explorer: New File',
      category: 'command',
      action: () => ctx.createFile(),
      keywords: ['new', 'file', 'create', 'explorer'],
    },
    {
      id: 'workbench.action.explorer.newFolder',
      label: 'Explorer: New Folder',
      category: 'command',
      action: () => ctx.createFolder(),
      keywords: ['new', 'folder', 'create', 'explorer'],
    },
    {
      id: 'workbench.action.explorer.refresh',
      label: 'Explorer: Refresh Explorer',
      category: 'command',
      action: () => ctx.refreshExplorer(),
      keywords: ['refresh', 'reload', 'explorer'],
    },
    {
      id: 'workbench.action.explorer.collapseAll',
      label: 'Explorer: Collapse All Folders',
      category: 'command',
      action: () => ctx.collapseExplorer(),
      keywords: ['collapse', 'explorer', 'folders'],
    },
  ];

  for (const item of items) {
    commandRegistry.register({
      id: item.id,
      label: item.label,
      category: item.category,
      shortcut: item.shortcut,
      keywords: item.keywords,
      action: item.action,
    });
  }

  return items;
}
