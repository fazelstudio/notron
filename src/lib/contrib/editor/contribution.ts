/**
 * Editor Contribution
 *
 * Registers editor extensions and menus.
 */

import { editorExtensionRegistry } from '../../editor/extensionRegistry';
import { contextMenuRegistry } from '../../workbench/contextMenuRegistry';
import { menuRegistry } from '../../workbench/menuRegistry';
import { editorStore } from '../../stores/editor';
import { isRunnableFile } from '../../utils/runTargets';
// Built-in snippet data (per language, consumed by the snippet engine).
import './snippets';

// Active editor tab, read at menu-build time so `disabled` stays in sync.
function activeTab() {
  const tabs = editorStore.getTabsSnapshot();
  const id = editorStore.getActiveTabIdSnapshot();
  return tabs.find((t: any) => t.id === id) ?? null;
}

/** True when the active file can be executed by a registered run target. */
function canRunActiveFile(): boolean {
  const tab = activeTab();
  if (!tab?.path || tab.path.startsWith('Untitled')) return false;
  if (tab.language === 'welcome') return false;
  return isRunnableFile(tab.path);
}

/** True when symbol navigation is meaningful for the active file. */
function canNavigateSymbols(): boolean {
  const tab = activeTab();
  if (!tab) return false;
  if (tab.isLargeFile) return false;
  return tab.language !== 'plaintext';
}

// Editor context menu entries — the editor renders these from the registry,
// so adding an action never touches Editor.svelte markup.
contextMenuRegistry.registerAll([
  { id: 'editor.runCode', contextId: 'editor/context', label: 'Run Code', shortcut: 'Ctrl+F5', command: 'workbench.action.debug.run', group: '1_run', order: 1, disabled: () => !canRunActiveFile() },
  { id: 'editor.gotoDefinition', contextId: 'editor/context', label: 'Go to Definition', shortcut: 'F12', command: 'editor.action.revealDefinition', group: '2_navigation', order: 1, disabled: () => !canNavigateSymbols() },
  { id: 'editor.gotoTypeDefinition', contextId: 'editor/context', label: 'Go to Type Definition', group: '2_navigation', order: 2, disabled: () => true },
  { id: 'editor.gotoImplementations', contextId: 'editor/context', label: 'Go to Implementations', group: '2_navigation', order: 3, disabled: () => true },
  { id: 'editor.findReferences', contextId: 'editor/context', label: 'Find All References', shortcut: 'Shift+F12', command: 'editor.action.referenceSearch.trigger', group: '2_navigation', order: 4, disabled: () => !canNavigateSymbols() },
  { id: 'editor.findImplementations', contextId: 'editor/context', label: 'Find All Implementations', group: '2_navigation', order: 5, disabled: () => true },
  { id: 'editor.showCallHierarchy', contextId: 'editor/context', label: 'Show Call Hierarchy', group: '2_navigation', order: 6, disabled: () => true },
  { id: 'editor.cut', contextId: 'editor/context', label: 'Cut', shortcut: 'Ctrl+X', command: 'editor.action.clipboardCutAction', group: '3_clipboard', order: 1 },
  { id: 'editor.copy', contextId: 'editor/context', label: 'Copy', shortcut: 'Ctrl+C', command: 'editor.action.clipboardCopyAction', group: '3_clipboard', order: 2 },
  { id: 'editor.paste', contextId: 'editor/context', label: 'Paste', shortcut: 'Ctrl+V', command: 'editor.action.clipboardPasteAction', group: '3_clipboard', order: 3 },
  { id: 'editor.commandPalette', contextId: 'editor/context', label: 'Command Palette', shortcut: 'Ctrl+Shift+P', command: 'workbench.action.showCommands', group: '4_palette', order: 1 }
]);

// Editor title menu (top-right of the editor) — same container model as the
// view title menus, so preview toggles are contributions, not markup.
menuRegistry.registerAll([
  { id: 'editor.title.showCode', menuId: 'editor/title', label: 'Preview: Show Code', command: 'workbench.action.preview.showCode', group: 'preview', order: 1 },
  { id: 'editor.title.showPreview', menuId: 'editor/title', label: 'Preview: Show Preview', command: 'workbench.action.preview.showPreview', group: 'preview', order: 2 },
  { id: 'editor.title.showSplit', menuId: 'editor/title', label: 'Preview: Open to the Side', command: 'workbench.action.preview.showSplit', group: 'preview', order: 3 }
]);

export const editorContrib = {
  id: 'editor',
  registry: editorExtensionRegistry
};