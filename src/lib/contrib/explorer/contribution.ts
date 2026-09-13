/**
 * Explorer Contribution
 *
 * Registers explorer views and menus.
 */

import { ACTIVITY_BAR_ITEMS, SIDEBAR_VIEWS } from '../../workbench/contributions';
import { contextMenuRegistry } from '../../workbench/contextMenuRegistry';
import { menuRegistry } from '../../workbench/menuRegistry';

// Ensure required views are registered.
if (ACTIVITY_BAR_ITEMS.find((i) => i.viewId === 'explorer') == null) {
  console.warn('[explorer/contribution] explorer activity bar item missing');
}
if (SIDEBAR_VIEWS.find((v) => v.id === 'explorer') == null) {
  console.warn('[explorer/contribution] explorer view missing');
}

// Explorer context menu entries.
contextMenuRegistry.registerAll([
  { id: 'explorer.newFile', contextId: 'explorer/context', label: 'New File', command: 'explorer.newFile', group: '1_new', order: 1 },
  { id: 'explorer.newFolder', contextId: 'explorer/context', label: 'New Folder', command: 'explorer.newFolder', group: '1_new', order: 2 },
  { id: 'explorer.open', contextId: 'explorer/context', label: 'Open', command: 'explorer.open', group: '2_open', order: 1 },
  { id: 'explorer.openToSide', contextId: 'explorer/context', label: 'Open to the Side', command: 'explorer.openToSide', group: '2_open', order: 2 },
  { id: 'explorer.copy', contextId: 'explorer/context', label: 'Copy', command: 'explorer.copy', group: '3_clipboard', order: 1 },
  { id: 'explorer.cut', contextId: 'explorer/context', label: 'Cut', command: 'explorer.cut', group: '3_clipboard', order: 2 },
  { id: 'explorer.paste', contextId: 'explorer/context', label: 'Paste', command: 'explorer.paste', group: '3_clipboard', order: 3 },
  { id: 'explorer.duplicate', contextId: 'explorer/context', label: 'Duplicate', command: 'explorer.duplicate', group: '3_clipboard', order: 4 },
  { id: 'explorer.rename', contextId: 'explorer/context', label: 'Rename', command: 'explorer.rename', group: '4_modify', order: 1 },
  { id: 'explorer.delete', contextId: 'explorer/context', label: 'Delete', command: 'explorer.delete', group: '4_modify', order: 2 },
  { id: 'explorer.copyPath', contextId: 'explorer/context', label: 'Copy Path', command: 'explorer.copyPath', group: '5_path', order: 1 },
  { id: 'explorer.copyRelativePath', contextId: 'explorer/context', label: 'Copy Relative Path', command: 'explorer.copyRelativePath', group: '5_path', order: 2 },
  { id: 'explorer.revealInFileManager', contextId: 'explorer/context', label: 'Reveal in File Manager', command: 'explorer.revealInFileManager', group: '6_reveal', order: 1 },
  { id: 'explorer.openInTerminal', contextId: 'explorer/context', label: 'Open in Terminal', command: 'explorer.openInTerminal', group: '6_reveal', order: 2 }
]);

// Explorer menubar entries.
menuRegistry.registerAll([
  { id: 'explorer.menubar.newFile', menuId: 'menubar/file', label: 'New File', command: 'workbench.action.files.newFile', group: 'new', order: 1 },
  { id: 'explorer.menubar.openFolder', menuId: 'menubar/file', label: 'Open Folder', command: 'workbench.action.files.openFolder', group: 'open', order: 1 }
]);

export const explorerContrib = {
  viewId: 'explorer',
  activityBarId: 'explorer'
};