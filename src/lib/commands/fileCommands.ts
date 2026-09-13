/**
 * File Commands
 *
 * Registers file & workspace commands via the central registry.
 * UI triggers must call commandRegistry.execute(id) — never invoke directly.
 */

import { commandRegistry } from './registry';
import { handleNewTextFile, openFileInActivePane } from '../services/editor/fileOperations';
import { open } from '@tauri-apps/plugin-dialog';
import { eventBus } from '../utils/eventBus';
import { uiStore } from '../stores/ui';
import { editorStore } from '../stores/editor';
import { splitStore } from '../stores/split';
import { save } from '@tauri-apps/plugin-dialog';
import { fileService } from '../services/fileService';
import { getHumanReadableError } from '../utils/error';

function reg(id: string, label: string, category: string, action: (...args:any[])=>any) {
  if (!commandRegistry.has(id)) commandRegistry.register({ id, label, category, action });
}
reg('workbench.action.files.newUntitledFile', 'File: New Untitled File', 'File', () => handleNewTextFile());
reg('workbench.action.files.newFile', 'File: New File…', 'File', () => uiStore.openNewFileDialog('menu'));
reg('workbench.action.files.openFile', 'File: Open File…', 'File', async () => {
  const selected = await open({ multiple: false });
  if (selected && typeof selected === 'string') await openFileInActivePane(selected);
});
reg('workbench.action.files.openFileAtPath', 'File: Open File at Path', 'File', async (path: string) => {
  if (typeof path === 'string' && path.length > 0) await openFileInActivePane(path);
});
reg('workbench.action.files.openFolder', 'File: Open Folder…', 'File', async () => {
  const selected = await open({ directory: true, multiple: false });
  if (selected && typeof selected === 'string') {
    if (selected === uiStore.getSnapshot().explorerRoot) return;
    if (!uiStore.getSnapshot().recentWorkspaces.includes(selected)) uiStore.setPendingTrustPath(selected);
    else eventBus.emit('request-workspace-switch', { path: selected });
  }
});
reg('workbench.action.openRecent', 'File: Open Recent…', 'File', () => uiStore.openRecentFoldersModal());
reg('workbench.action.newWindow', 'File: New Window', 'File', async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_new_window');
});
reg('workbench.action.files.save', 'File: Save', 'File', async () => {
  const tabs = editorStore.getTabsSnapshot();
  const activeId = editorStore.getActiveTabIdSnapshot();
  const activeTab = tabs.find(t => t.id === activeId) || null;
  if (!activeTab) return;
  if (activeTab.path.startsWith('Untitled')) {
    const selected = await save();
    if (selected && typeof selected === 'string') {
      const fileName = selected.split(/[/\\]/).pop() || 'Unknown';
      try {
        await fileService.save(selected, activeTab.content ?? '');
        editorStore.updateTab(activeTab.id, { path: selected, name: fileName });
        splitStore.updateTabInAllPanes({ id: activeTab.id, path: selected, name: fileName });
        editorStore.markSaved(activeTab.id);
      } catch (err) { uiStore.addToast('Save Failed', 'alert', getHumanReadableError(err)); }
    }
  } else {
    try { await fileService.save(activeTab.path, activeTab.content ?? ''); editorStore.markSaved(activeTab.id); uiStore.addToast('Saved', 'success'); } catch (err) { uiStore.addToast('Save Failed', 'alert', getHumanReadableError(err)); }
  }
});
reg('workbench.action.files.saveAs', 'File: Save As…', 'File', async () => {
  const tabs = editorStore.getTabsSnapshot();
  const activeId = editorStore.getActiveTabIdSnapshot();
  const activeTab = tabs.find(t => t.id === activeId) || null;
  if (!activeTab) return;
  const selected = await save();
  if (selected && typeof selected === 'string') {
    try {
      await fileService.save(selected, activeTab.content ?? '');
      const fileName = selected.split(/[/\\]/).pop() || 'Unknown';
      editorStore.updateTab(activeTab.id, { path: selected, name: fileName });
      splitStore.updateTabInAllPanes({ id: activeTab.id, path: selected, name: fileName });
      editorStore.markSaved(activeTab.id);
    } catch (err) { uiStore.addToast('Save Failed', 'alert', getHumanReadableError(err)); }
  }
});
reg('workbench.action.reopenClosedEditor', 'View: Reopen Closed Editor', 'View', () => editorStore.reopenClosedTab());
reg('workbench.action.closeFolder', 'File: Close Folder', 'File', () => { uiStore.setExplorerRoot(null); uiStore.addToast('Folder closed', 'success'); });
reg('workbench.action.closeWorkspace', 'File: Close Workspace', 'File', () => { uiStore.setExplorerRoot(null); uiStore.addToast('Workspace closed', 'success'); });
