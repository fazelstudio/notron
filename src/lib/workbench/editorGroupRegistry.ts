/**
 * Editor Group / Tab Manager
 *
 * Single abstraction for manipulating tabs / editor groups. Both the UI and
 * (future) extension API go through this service — no direct DOM manipulation.
 * Mirrors VS Code's editor group / tab API.
 */

import { editorStore } from '../stores/editor';
import { splitStore } from '../stores/split';
import type { EditorTab } from '../stores/editor';

export type EditorGroupId = string;

export interface EditorGroupService {
  /** Open a new tab in the active group */
  openTab(tab: EditorTab, options?: { preview?: boolean; active?: boolean }): void;
  /** Close a tab by id (in all groups) */
  closeTab(tabId: string): void;
  /** Close all tabs */
  closeAll(): void;
  /** Pin a preview tab */
  pinTab(tabId: string): void;
  /** Set active tab */
  setActive(tabId: string): void;
  /** Get active tab */
  getActive(): EditorTab | null;
  /** Get all tabs in active group */
  getTabs(): EditorTab[];
  /** Move tab to another group */
  moveTab(tabId: string, targetGroupId: EditorGroupId): void;
  /** Split active group */
  split(direction: 'right' | 'down'): void;
}

class EditorGroupManager implements EditorGroupService {
  openTab(tab: EditorTab, _options?: { preview?: boolean; active?: boolean }): void {
    const snap = splitStore.getSnapshot();
    const activePaneId = snap.activePaneId;
    editorStore.addTab(tab);
    editorStore.setActiveTab(tab.id);
    if (activePaneId) splitStore.addTabToPane(activePaneId, tab as any);
  }

  closeTab(tabId: string): void {
    editorStore.closeTab(tabId);
    splitStore.closeTabInAllPanes(tabId);
  }

  closeAll(): void {
    const tabs = editorStore.getTabsSnapshot();
    for (const t of tabs) this.closeTab(t.id);
  }

  pinTab(tabId: string): void {
    editorStore.updateTab(tabId, { isPreview: false, isPinned: true } as any);
    splitStore.updateTabInAllPanes({ id: tabId, isPreview: false, isPinned: true } as any);
  }

  setActive(tabId: string): void {
    editorStore.setActiveTab(tabId);
    const snap = splitStore.getSnapshot();
    const paneId = Object.keys(snap.panes).find((pid) =>
      (snap.panes as any)[pid].tabs.some((t: any) => t.id === tabId)
    );
    if (paneId) splitStore.setActivePaneTab(paneId, tabId);
  }

  getActive(): EditorTab | null {
    const tabs = editorStore.getTabsSnapshot();
    const id = editorStore.getActiveTabIdSnapshot();
    return tabs.find((t) => t.id === id) ?? null;
  }

  getTabs(): EditorTab[] {
    return editorStore.getTabsSnapshot() as EditorTab[];
  }

  moveTab(tabId: string, targetGroupId: EditorGroupId): void {
    const tab = editorStore.getTabsSnapshot().find((t: any) => t.id === tabId);
    if (!tab) return;
    const snap = splitStore.getSnapshot();
    const sourcePaneId = Object.keys(snap.panes).find((pid) =>
      (snap.panes as any)[pid].tabs.some((t: any) => t.id === tabId)
    );
    if (sourcePaneId) splitStore.closeTabInPane(sourcePaneId, tabId);
    splitStore.addTabToPane(targetGroupId, tab as any);
  }

  split(direction: 'right' | 'down'): void {
    const snap = splitStore.getSnapshot();
    const targetPaneId = snap.activePaneId;
    if (!targetPaneId) return;
    // Map generic direction to splitStore's pane-relative direction.
    const dir = direction === 'right' ? 'right' : 'down';
    splitStore.splitPane(targetPaneId, dir as any);
  }
}

export const editorGroupService = new EditorGroupManager();
