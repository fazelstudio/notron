/**
 * Tab Commands
 *
 * Registers tab and split operations as commands.
 */

import { commandRegistry } from './registry';
import { editorStore } from '../stores/editor';
import { splitStore } from '../stores/split';

function activePaneId(): string | null {
  return splitStore.getSnapshot().activePaneId ?? null;
}

function activeTabId(): string | null {
  const paneId = activePaneId();
  if (!paneId) return null;
  const pane = (splitStore.getSnapshot().panes as any)[paneId];
  return pane?.activeTabId ?? null;
}

commandRegistry.register({
  id: 'workbench.action.closeActiveEditor',
  label: 'Close Active Editor',
  category: 'View',
  action: () => {
    const id = activeTabId();
    if (!id) return;
    const tab = editorStore.getTabsSnapshot().find((t: any) => t.id === id);
    // Split can retain a ghost tab after a partial close — drop it from the pane.
    if (!tab) {
      const pane = activePaneId();
      if (pane) splitStore.closeTabInPane(pane, id);
      return;
    }
    // Heal false dirty: content matches baseline but isModified stuck true
    // (common after preview/code races left originalContent out of sync).
    const falselyDirty =
      tab.isModified &&
      tab.content !== null &&
      tab.originalContent !== null &&
      tab.content === tab.originalContent;
    if (falselyDirty) {
      editorStore.markSaved(tab.id);
    }
    const reallyDirty =
      (!falselyDirty && tab.isModified) ||
      (tab.path.startsWith('Untitled') && !!tab.content && tab.content.trim() !== '');
    if (reallyDirty) {
      // Let the UI show the save dialog via the existing flow.
      import('../utils/eventBus').then(({ eventBus }) => {
        eventBus.emit('split:request-close-tab', { tabId: id });
      });
    } else {
      const pane = activePaneId();
      if (pane) splitStore.closeTabInPane(pane, id);
      editorStore.closeTab(id);
    }
  }
});

commandRegistry.register({
  id: 'workbench.action.closeOtherEditors',
  label: 'Close Other Editors',
  category: 'View',
  action: () => {
    const keep = activeTabId();
    const paneId = activePaneId();
    if (!paneId || !keep) return;
    const pane = (splitStore.getSnapshot().panes as any)[paneId];
    if (!pane) return;
    for (const t of [...pane.tabs]) {
      if (t.id !== keep) {
        splitStore.closeTabInPane(paneId, t.id);
        editorStore.closeTab(t.id);
      }
    }
  }
});

commandRegistry.register({
  id: 'workbench.action.closeEditorsToTheRight',
  label: 'Close Editors to the Right',
  category: 'View',
  action: () => {
    const keep = activeTabId();
    const paneId = activePaneId();
    if (!paneId || !keep) return;
    const pane = (splitStore.getSnapshot().panes as any)[paneId];
    if (!pane) return;
    const idx = pane.tabs.findIndex((t: any) => t.id === keep);
    if (idx === -1) return;
    for (let i = idx + 1; i < pane.tabs.length; i++) {
      const t = pane.tabs[i];
      splitStore.closeTabInPane(paneId, t.id);
      editorStore.closeTab(t.id);
    }
  }
});

commandRegistry.register({
  id: 'workbench.action.pinEditor',
  label: 'Pin Editor',
  category: 'View',
  action: () => {
    const id = activeTabId();
    if (id) editorStore.pinTab(id);
  }
});

commandRegistry.register({
  id: 'workbench.action.splitEditorRight',
  label: 'Split Editor Right',
  category: 'View',
  action: () => {
    const pane = activePaneId();
    if (pane) splitStore.splitPane(pane, 'right');
  }
});

commandRegistry.register({
  id: 'workbench.action.splitEditorDown',
  label: 'Split Editor Down',
  category: 'View',
  action: () => {
    const pane = activePaneId();
    if (pane) splitStore.splitPane(pane, 'down');
  }
});

commandRegistry.register({
  id: 'workbench.action.splitEditorLeft',
  label: 'Split Editor Left',
  category: 'View',
  action: () => {
    const pane = activePaneId();
    if (pane) splitStore.splitPane(pane, 'left');
  }
});

commandRegistry.register({
  id: 'workbench.action.splitEditorUp',
  label: 'Split Editor Up',
  category: 'View',
  action: () => {
    const pane = activePaneId();
    if (pane) splitStore.splitPane(pane, 'up');
  }
});

commandRegistry.register({
  id: 'workbench.action.focusActiveEditorGroup',
  label: 'Focus Active Editor Group',
  category: 'View',
  action: () => {
    const pane = activePaneId();
    if (pane) splitStore.setActivePane(pane);
  }
});

// Context menu contributions for tabs and pane empty area.
import { contextMenuRegistry } from '../workbench/contextMenuRegistry';

contextMenuRegistry.registerAll([
  { id: 'tab.close', contextId: 'tab/context', label: 'Close Tab', command: 'workbench.action.closeActiveEditor', group: 'close', order: 1 },
  { id: 'tab.closeOther', contextId: 'tab/context', label: 'Close Other', command: 'workbench.action.closeOtherEditors', group: 'close', order: 2 },
  { id: 'tab.closeRight', contextId: 'tab/context', label: 'Close to the Right', command: 'workbench.action.closeEditorsToTheRight', group: 'close', order: 3 },
  { id: 'tab.copyPath', contextId: 'tab/context', label: 'Copy Path', group: 'copy', order: 1 },
  { id: 'pane.newTextFile', contextId: 'pane/context', label: 'New Text File', command: 'workbench.action.files.newUntitledFile', group: 'new', order: 1 },
  { id: 'pane.openFile', contextId: 'pane/context', label: 'Open File', command: 'workbench.action.files.openFile', group: 'new', order: 2 },
  { id: 'pane.splitUp', contextId: 'pane/context', label: 'Split Up', command: 'workbench.action.splitEditorUp', group: 'split', order: 1 },
  { id: 'pane.splitDown', contextId: 'pane/context', label: 'Split Down', command: 'workbench.action.splitEditorDown', group: 'split', order: 2 },
  { id: 'pane.splitLeft', contextId: 'pane/context', label: 'Split Left', command: 'workbench.action.splitEditorLeft', group: 'split', order: 3 },
  { id: 'pane.splitRight', contextId: 'pane/context', label: 'Split Right', command: 'workbench.action.splitEditorRight', group: 'split', order: 4 }
]);
