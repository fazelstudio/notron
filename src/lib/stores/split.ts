import { writable } from 'svelte/store';
import type { EditorTab } from './editor';
import { generateId } from '../constants';

export type SplitDirection = 'horizontal' | 'vertical';

export interface EditorPane {
  id: string;
  tabs: EditorTab[];
  activeTabId: string | null;
}

export interface SplitNode {
  id: string;
  type: 'pane' | 'split';
  // Only for 'pane' type
  paneId?: string;
  // Only for 'split' type
  direction?: SplitDirection;
  children?: [SplitNode, SplitNode];
  splitRatio?: number; // 0–1, size of first child
}

interface SplitState {
  panes: Record<string, EditorPane>;
  rootNode: SplitNode;
  activePaneId: string;
}

function createInitialPane(): EditorPane {
  const id = generateId('pane');
  return { id, tabs: [], activeTabId: null };
}

function createInitialState(): SplitState {
  const pane = createInitialPane();
  return {
    panes: { [pane.id]: pane },
    rootNode: { id: generateId('node'), type: 'pane', paneId: pane.id },
    activePaneId: pane.id,
  };
}

function replaceNodeById(root: SplitNode, targetId: string, replacement: SplitNode): SplitNode {
  if (root.id === targetId) return replacement;
  if (root.type === 'split' && root.children) {
    return {
      ...root,
      children: [
        replaceNodeById(root.children[0], targetId, replacement),
        replaceNodeById(root.children[1], targetId, replacement),
      ] as [SplitNode, SplitNode],
    };
  }
  return root;
}

/** Remove a pane from the tree, collapsing parent split */
function removePane(root: SplitNode, paneId: string): SplitNode | null {
  if (root.type === 'pane') {
    return root.paneId === paneId ? null : root;
  }
  if (root.type === 'split' && root.children) {
    const [left, right] = root.children;
    const newLeft = removePane(left, paneId);
    const newRight = removePane(right, paneId);
    if (newLeft === null && newRight === null) return null;
    if (newLeft === null) return newRight;
    if (newRight === null) return newLeft;
    return { ...root, children: [newLeft, newRight] as [SplitNode, SplitNode] };
  }
  return root;
}

function collectPaneIds(node: SplitNode): string[] {
  if (node.type === 'pane') return node.paneId ? [node.paneId] : [];
  if (node.type === 'split' && node.children) {
    return [...collectPaneIds(node.children[0]), ...collectPaneIds(node.children[1])];
  }
  return [];
}

function findLeafNodeId(node: SplitNode, paneId: string): string | null {
  if (node.type === 'pane' && node.paneId === paneId) return node.id;
  if (node.type === 'split' && node.children) {
    return findLeafNodeId(node.children[0], paneId) || findLeafNodeId(node.children[1], paneId);
  }
  return null;
}

function createSplitStore() {
  const store = writable<SplitState>(createInitialState());

  /** Reset the split tree back to a single empty pane (used on workspace
   *  switch so stale panes from the previous workspace never linger). */
  function resetToSinglePane() {
    store.set(createInitialState());
  }

  function splitPane(targetPaneId: string, direction: 'up' | 'down' | 'left' | 'right') {
    store.update((state) => {
      const targetPane = state.panes[targetPaneId];
      if (!targetPane) return state;

      const newPane: EditorPane = { id: generateId('pane'), tabs: [], activeTabId: null };

      const splitDir: SplitDirection =
        direction === 'left' || direction === 'right' ? 'vertical' : 'horizontal';

      const isNewFirst = direction === 'left' || direction === 'up';

      const existingLeaf: SplitNode = {
        id: generateId('node'),
        type: 'pane',
        paneId: targetPaneId,
      };
      const newLeaf: SplitNode = {
        id: generateId('node'),
        type: 'pane',
        paneId: newPane.id,
      };

      const splitNode: SplitNode = {
        id: generateId('node'),
        type: 'split',
        direction: splitDir,
        children: isNewFirst ? [newLeaf, existingLeaf] : [existingLeaf, newLeaf],
        splitRatio: 0.5,
      };

      const leafNodeId = findLeafNodeId(state.rootNode, targetPaneId);
      if (!leafNodeId) return state;

      const newRoot = replaceNodeById(state.rootNode, leafNodeId, splitNode);

      return {
        ...state,
        panes: { ...state.panes, [newPane.id]: newPane },
        rootNode: newRoot,
        activePaneId: newPane.id,
      };
    });
  }

  function closePaneById(paneId: string) {
    store.update((state) => {
      const allPaneIds = collectPaneIds(state.rootNode);
      if (allPaneIds.length <= 1) {
        const pane = state.panes[paneId];
        if (!pane) return state;
        return {
          ...state,
          panes: { ...state.panes, [paneId]: { ...pane, tabs: [], activeTabId: null } },
        };
      }

      const newRoot = removePane(state.rootNode, paneId);
      if (!newRoot) return state;

      const newPanes = { ...state.panes };
      delete newPanes[paneId];

      const remainingIds = collectPaneIds(newRoot);
      const newActiveId =
        state.activePaneId === paneId ? (remainingIds[0] ?? null) : state.activePaneId;

      return {
        ...state,
        panes: newPanes,
        rootNode: newRoot,
        activePaneId: newActiveId ?? remainingIds[0],
      };
    });
  }

  function setActivePane(paneId: string) {
    store.update((state) => ({ ...state, activePaneId: paneId }));
  }

  function addTabToPane(paneId: string, tab: EditorTab) {
    store.update((state) => {
      const pane = state.panes[paneId];
      if (!pane) return state;
      const exists = pane.tabs.find((t) => t.id === tab.id || (t.path === tab.path && t.language === tab.language));
      if (exists) {
        return {
          ...state,
          panes: { ...state.panes, [paneId]: { ...pane, activeTabId: exists.id } },
        };
      }
      return {
        ...state,
        panes: {
          ...state.panes,
          [paneId]: { ...pane, tabs: [...pane.tabs, tab], activeTabId: tab.id },
        },
      };
    });
  }

  function replaceTabInPane(paneId: string, oldTabId: string, newTab: EditorTab) {
    store.update((state) => {
      const pane = state.panes[paneId];
      if (!pane) return state;
      const index = pane.tabs.findIndex((t) => t.id === oldTabId);
      if (index === -1) {
        return {
          ...state,
          panes: {
            ...state.panes,
            [paneId]: { ...pane, tabs: [...pane.tabs, newTab], activeTabId: newTab.id },
          },
        };
      }
      const newTabs = [...pane.tabs];
      newTabs[index] = newTab;
      return {
        ...state,
        panes: {
          ...state.panes,
          [paneId]: { ...pane, tabs: newTabs, activeTabId: newTab.id },
        },
      };
    });
  }

  function closeTabInPane(paneId: string, tabId: string) {
    store.update((state) => {
      const pane = state.panes[paneId];
      if (!pane) return state;
      const newTabs = pane.tabs.filter((t) => t.id !== tabId);
      let newActiveId = pane.activeTabId;
      if (newActiveId === tabId) {
        newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
      }
      return {
        ...state,
        panes: { ...state.panes, [paneId]: { ...pane, tabs: newTabs, activeTabId: newActiveId } },
      };
    });
  }

  /** Close a tab from every pane (used when a file disappears from disk). */
  function closeTabInAllPanes(tabId: string) {
    store.update((state) => {
      const newPanes = { ...state.panes };
      for (const [paneId, pane] of Object.entries(newPanes)) {
        if (!pane.tabs.some((t) => t.id === tabId)) continue;
        const newTabs = pane.tabs.filter((t) => t.id !== tabId);
        newPanes[paneId] = {
          ...pane,
          tabs: newTabs,
          activeTabId: pane.activeTabId === tabId
            ? (newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null)
            : pane.activeTabId,
        };
      }
      return { ...state, panes: newPanes };
    });
  }

  /**
   * Follow a disk rename inside every pane. When `oldPath` is a directory,
   * every tab nested below it is updated too (prefix-aware).
   */
  function updateTabPathInAllPanes(oldPath: string, newPath: string) {
    store.update((state) => {
      const newPanes = { ...state.panes };
      for (const [paneId, pane] of Object.entries(newPanes)) {
        let changed = false;
        const newTabs = pane.tabs.map((t) => {
          const isUnderOld = t.path === oldPath
            || t.path.startsWith(oldPath + '/')
            || t.path.startsWith(oldPath + '\\');
          if (!isUnderOld) return t;
          changed = true;
          const newTabPath = t.path === oldPath ? newPath : newPath + t.path.slice(oldPath.length);
          return { ...t, path: newTabPath, name: newTabPath.split(/[/\\]/).pop() || t.name };
        });
        if (changed) newPanes[paneId] = { ...pane, tabs: newTabs };
      }
      return { ...state, panes: newPanes };
    });
  }

  function setActivePaneTab(paneId: string, tabId: string) {
    store.update((state) => {
      const pane = state.panes[paneId];
      if (!pane) return state;
      return {
        ...state,
        panes: { ...state.panes, [paneId]: { ...pane, activeTabId: tabId } },
      };
    });
  }

  function closeAllTabsInPane(paneId: string) {
    store.update((state) => {
      const pane = state.panes[paneId];
      if (!pane) return state;
      return {
        ...state,
        panes: { ...state.panes, [paneId]: { ...pane, tabs: [], activeTabId: null } },
      };
    });
  }

  function updateTabInAllPanes(updatedTab: Partial<EditorTab> & { id: string }) {
    store.update((state) => {
      const newPanes = { ...state.panes };
      for (const [paneId, pane] of Object.entries(newPanes)) {
        const idx = pane.tabs.findIndex((t) => t.id === updatedTab.id);
        if (idx !== -1) {
          const newTabs = [...pane.tabs];
          newTabs[idx] = { ...newTabs[idx], ...updatedTab };
          newPanes[paneId] = { ...pane, tabs: newTabs };
        }
      }
      return { ...state, panes: newPanes };
    });
  }

  function updateSplitRatio(nodeId: string, ratio: number) {
    // Guard: a stale drag handle from an unmounted pane must not resurrect
    // a split node whose pane no longer exists.
    function find(node: SplitNode): boolean {
      if (node.id === nodeId) return true;
      if (node.type === 'split' && node.children) {
        return find(node.children[0]) || find(node.children[1]);
      }
      return false;
    }
    if (!find(getSnapshot().rootNode)) return;
    store.update((state) => {
      function updateRatio(node: SplitNode): SplitNode {
        if (node.id === nodeId) return { ...node, splitRatio: ratio };
        if (node.type === 'split' && node.children) {
          return {
            ...node,
            children: [updateRatio(node.children[0]), updateRatio(node.children[1])] as [SplitNode, SplitNode],
          };
        }
        return node;
      }
      return { ...state, rootNode: updateRatio(state.rootNode) };
    });
  }

  function getSnapshot(): SplitState {
    let val: SplitState = null!;
    store.subscribe((v) => (val = v))();
    return val;
  }

  function setState(newState: SplitState) {
    store.set(newState);
  }

  return {
    subscribe: store.subscribe,
    setState,
    resetToSinglePane,
    splitPane,
    closePane: closePaneById,
    setActivePane,
    addTabToPane,
    replaceTabInPane,
    closeTabInPane,
    closeTabInAllPanes,
    updateTabPathInAllPanes,
    setActivePaneTab,
    closeAllTabsInPane,
    updateTabInAllPanes,
    updateSplitRatio,
    getSnapshot,
    collectPaneIds: (node?: SplitNode) => {
      const snap = getSnapshot();
      return collectPaneIds(node ?? snap.rootNode);
    },
  };
}

export const splitStore = createSplitStore();
