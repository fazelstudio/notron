/**
 * Explorer Commands
 *
 * Registers file explorer actions.
 */

import { commandRegistry } from './registry';

export function registerExplorerCommands(ctx: {
  newFile: (parentPath?: string) => void;
  newFolder: (parentPath?: string) => void;
  refresh: () => void;
  collapseAll: () => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  duplicate: () => void;
  rename: () => void;
  delete: () => void;
  copyPath: () => void;
  copyRelativePath: () => void;
  revealInFileManager: () => void;
  openInTerminal: () => void;
  openToSide: () => void;
  toggleDotFiles: () => void;
}): void {
  const cmds = [
    { id: 'explorer.newFile', label: 'Explorer: New File', category: 'File', action: () => ctx.newFile() },
    { id: 'explorer.newFolder', label: 'Explorer: New Folder', category: 'File', action: () => ctx.newFolder() },
    { id: 'explorer.refresh', label: 'Explorer: Refresh', category: 'File', action: ctx.refresh },
    { id: 'explorer.collapseAll', label: 'Explorer: Collapse All', category: 'File', action: ctx.collapseAll },
    { id: 'explorer.copy', label: 'Explorer: Copy', category: 'File', shortcut: 'Ctrl+C', action: ctx.copy },
    { id: 'explorer.cut', label: 'Explorer: Cut', category: 'File', shortcut: 'Ctrl+X', action: ctx.cut },
    { id: 'explorer.paste', label: 'Explorer: Paste', category: 'File', shortcut: 'Ctrl+V', action: ctx.paste },
    { id: 'explorer.duplicate', label: 'Explorer: Duplicate', category: 'File', action: () => ctx.duplicate() },
    { id: 'explorer.rename', label: 'Explorer: Rename', category: 'File', shortcut: 'F2', action: () => ctx.rename() },
    { id: 'explorer.delete', label: 'Explorer: Delete', category: 'File', shortcut: 'Delete', action: () => ctx.delete() },
    { id: 'explorer.copyPath', label: 'Explorer: Copy Path', category: 'File', shortcut: 'Ctrl+Shift+C', action: () => ctx.copyPath() },
    { id: 'explorer.copyRelativePath', label: 'Explorer: Copy Relative Path', category: 'File', action: () => ctx.copyRelativePath() },
    { id: 'explorer.revealInFileManager', label: 'Explorer: Reveal in File Manager', category: 'File', action: () => ctx.revealInFileManager() },
    { id: 'explorer.openInTerminal', label: 'Explorer: Open in Terminal', category: 'File', shortcut: 'Ctrl+`', action: () => ctx.openInTerminal() },
    { id: 'explorer.openToSide', label: 'Explorer: Open to the Side', category: 'File', action: () => ctx.openToSide() },
    { id: 'explorer.toggleDotFiles', label: 'Explorer: Toggle Hidden Files', category: 'File', action: ctx.toggleDotFiles }
  ];
  for (const c of cmds) if (!commandRegistry.has(c.id)) commandRegistry.register(c as any);
}
