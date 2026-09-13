/**
 * Workspace Session Service
 *
 * Handles workspace persistence and startup.
 */

import { invoke } from '@tauri-apps/api/core';
import { editorStore } from '../../stores/editor';
import { uiStore } from '../../stores/ui';
import { terminalStore } from '../../stores/terminal';
import { sourceControlStore } from '../../stores/sourceControl';
import { splitStore } from '../../stores/split';

// Debounce timers — part-level so multiple callers share the same schedule.
let cursorScrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
let expandStateSaveTimer: ReturnType<typeof setTimeout> | null = null;
let fullSessionSaveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Persist the current workspace session to Rust (SQLite).
 * Filters tabs to the active workspace and sanitizes split state.
 */
export async function saveWorkspaceSession(): Promise<void> {
  const explorerRoot = uiStore.getSnapshot().explorerRoot;
  if (!explorerRoot) return;
  try {
    const uiVal = uiStore.getSnapshot();
    const tabsSnapshot = editorStore.getTabsSnapshot();
    const termVal = terminalStore.getSnapshot();

    const validTabs = tabsSnapshot.filter(
      (t: any) =>
        t.language !== 'welcome' &&
        (t.path.startsWith('Untitled') || t.path.toLowerCase().startsWith(explorerRoot.toLowerCase()))
    );
    const validTabIds = new Set(validTabs.map((t: any) => t.id));
    let activeTabId = editorStore.getActiveTabIdSnapshot();
    if (activeTabId && !validTabIds.has(activeTabId)) {
      activeTabId = validTabs.length > 0 ? validTabs[0].id : null;
    }

    const rawSplitState = splitStore.getSnapshot();
    const sanitizedSplitState = {
      ...rawSplitState,
      panes: Object.fromEntries(
        Object.entries(rawSplitState.panes).map(([k, v]) => [
          k,
          {
            ...v,
            tabs: (v as any).tabs.map((t: any) => ({
              id: t.id,
              path: t.path,
              name: t.name,
              language: t.language,
              isPreview: t.isPreview,
              isPinned: t.isPinned,
              isModified: t.isModified,
              content: t.isModified ? t.content : undefined,
              isDiff: t.isDiff,
              readOnly: t.readOnly,
              noPreview: t.noPreview,
              isUnsupported: t.isUnsupported,
              gitRevision: t.gitRevision,
              diffEditable: t.diffEditable,
              diffOriginalLabel: t.diffOriginalLabel,
              diffCurrentLabel: t.diffCurrentLabel,
              diffOriginalRevision: t.diffOriginalRevision,
              diffCurrentRevision: t.diffCurrentRevision,
              diffOriginalContent: t.diffOriginalContent,
            })),
          },
        ])
      ),
    };

    const session = {
      sidebarWidth: uiVal.sidebarWidth,
      isSidebarOpen: uiVal.isSidebarOpen,
      expandedPaths: uiStore.getExpandedPathsSnapshot(),
      activeSidebarPanel: uiVal.activeSidebarPanel,
      isMinimapEnabled: uiVal.isMinimapEnabled,
      isBreadcrumbsEnabled: uiVal.isBreadcrumbsEnabled,
      isStickyScrollEnabled: uiVal.isStickyScrollEnabled,
      isStatusBarEnabled: uiVal.isStatusBarEnabled,
      searchQuery: uiVal.searchQuery,
      replaceQuery: uiVal.replaceQuery,
      terminals: termVal.terminals,
      activeTerminalId: termVal.activeTerminalId,
      terminalVisible: termVal.isVisible,
      terminalMaximized: termVal.isMaximized,
      terminalHeight: termVal.height,
      terminalActivePanel: termVal.activePanel,
      tabs: validTabs.map((t: any) => ({
        id: t.id,
        path: t.path,
        name: t.name,
        language: t.language,
        isPreview: t.isPreview,
        isPinned: t.isPinned,
        cursor: editorStore.getCursor(t.id),
        scroll: editorStore.getScroll(t.id),
        isModified: t.isModified,
        content: t.isModified ? t.content : undefined,
        svgViewMode: t.svgViewMode,
        mdViewMode: t.mdViewMode,
        isDiff: t.isDiff,
        readOnly: t.readOnly,
        noPreview: t.noPreview,
        isUnsupported: t.isUnsupported,
        gitRevision: t.gitRevision,
        diffEditable: t.diffEditable,
        diffOriginalLabel: t.diffOriginalLabel,
        diffCurrentLabel: t.diffCurrentLabel,
        diffOriginalRevision: t.diffOriginalRevision,
        diffCurrentRevision: t.diffCurrentRevision,
        diffOriginalContent: t.diffOriginalContent,
      })),
      activeTabId,
      splitState: sanitizedSplitState,
    };

    await Promise.all([
      invoke('save_workspace_session', {
        workspacePath: explorerRoot,
        sessionJson: JSON.stringify(session),
      }),
      invoke('save_ui_state', {
        workspaceId: explorerRoot,
        ui: {
          sidebar_width: uiVal.sidebarWidth,
          panel_height: null,
          sidebar_visible: uiVal.isSidebarOpen,
          expanded_folder_paths: JSON.stringify(uiStore.getExpandedPathsSnapshot()),
          active_sidebar_panel: uiVal.activeSidebarPanel,
          is_minimap_enabled: uiVal.isMinimapEnabled,
        },
      }).catch(() => {}),
      invoke('save_session_state', {
        workspaceId: explorerRoot,
        session: {
          open_tabs_json: JSON.stringify(session.tabs),
          active_tab_id: session.activeTabId,
          scroll_positions_json: null,
          editor_snapshots_json: null,
        },
      }).catch(() => {}),
      invoke('save_dirty_tab_snapshots', {
        tabs: session.tabs
          .filter((t: any) => t.isModified && t.content !== undefined && !t.isLargeFile)
          .map((t: any) => ({
            path: t.path,
            content: t.content,
            cursor_pos: t.cursor?.line || 0,
          })),
      }).catch(() => {}),
    ]);
  } catch (err) {
    console.error('Failed to save workspace session:', err);
  }
}

export async function saveCursorScroll(): Promise<void> {
  const explorerRoot = uiStore.getSnapshot().explorerRoot;
  if (!explorerRoot) return;
  const cursorData = editorStore.getCursorScrollSnapshot();
  try {
    await invoke('save_workspace_state', {
      workspacePath: explorerRoot,
      pairs: [['cursor_scroll', JSON.stringify(cursorData)]],
    });
  } catch (err) {
    console.error('Failed to save cursor/scroll:', err);
  }
}

export async function saveExpandedState(): Promise<void> {
  const explorerRoot = uiStore.getSnapshot().explorerRoot;
  if (!explorerRoot) return;
  const paths = uiStore.getExpandedPathsSnapshot();
  try {
    await invoke('save_workspace_expanded_paths', {
      workspacePath: explorerRoot,
      pathsJson: JSON.stringify(paths),
    });
  } catch (err) {
    console.error('Failed to save expanded paths:', err);
  }
}

export function debouncedSaveCursorScroll(): void {
  if (cursorScrollSaveTimer) clearTimeout(cursorScrollSaveTimer);
  cursorScrollSaveTimer = setTimeout(saveCursorScroll, 3000);
}

export function debouncedSaveExpanded(): void {
  if (expandStateSaveTimer) clearTimeout(expandStateSaveTimer);
  expandStateSaveTimer = setTimeout(saveExpandedState, 1000);
}

export function debouncedSaveFullSession(): void {
  if (fullSessionSaveTimer) clearTimeout(fullSessionSaveTimer);
  fullSessionSaveTimer = setTimeout(saveWorkspaceSession, 2000);
}

export function recordStartupPhase(name: string): void {
  invoke('record_startup_timer', { name }).catch(() => {});
}

/**
 * Apply a parsed workspace session to all stores.
 * Used by both initial startup and workspace-switch flows.
 */
export function applySessionState(parsed: any, stateMap: Map<string, string>): void {
  splitStore.resetToSinglePane();

  if (parsed.sidebarWidth !== undefined) uiStore.setSidebarWidth(parsed.sidebarWidth);
  if (parsed.isSidebarOpen !== undefined) uiStore.setSidebarOpen(parsed.isSidebarOpen);
  if (parsed.expandedPaths !== undefined) uiStore.setExpandedPaths(parsed.expandedPaths);
  if (parsed.activeSidebarPanel !== undefined) uiStore.setActiveSidebarPanel(parsed.activeSidebarPanel);
  if (parsed.isMinimapEnabled !== undefined) uiStore.setMinimapEnabled(parsed.isMinimapEnabled);
  if (parsed.isBreadcrumbsEnabled !== undefined) uiStore.setBreadcrumbsEnabled(parsed.isBreadcrumbsEnabled);
  if (parsed.isStickyScrollEnabled !== undefined) uiStore.setStickyScrollEnabled(parsed.isStickyScrollEnabled);
  if (parsed.isStatusBarEnabled !== undefined) uiStore.setStatusBarEnabled(parsed.isStatusBarEnabled);
  if (parsed.searchQuery !== undefined) uiStore.setSearchQuery(parsed.searchQuery);
  if (parsed.replaceQuery !== undefined) uiStore.setReplaceQuery(parsed.replaceQuery);

  terminalStore.setTerminals(parsed.terminals || [], parsed.activeTerminalId || null);
  if (parsed.terminalMaximized !== undefined) terminalStore.setMaximize(parsed.terminalMaximized);
  if (parsed.terminalHeight !== undefined) terminalStore.setHeight(parsed.terminalHeight);
  // Restore active panel silently (without auto-showing), then restore visibility exactly as saved.
  // This ensures the panel reopens on the same tab (terminal / output / problems) the user left it on.
  if (parsed.terminalActivePanel !== undefined) (terminalStore as any).setActivePanelSilently?.(parsed.terminalActivePanel);
  if (parsed.terminalVisible !== undefined) terminalStore.setVisibility(!!parsed.terminalVisible);
  else terminalStore.setVisibility(false);
  if (parsed.sourceControlState !== undefined) sourceControlStore.hydrate(parsed.sourceControlState);

  let lazyTabs: any[] = [];
  if (parsed.tabs && parsed.tabs.length > 0) {
    lazyTabs = parsed.tabs.map((t: any) => {
      // Ignore empty dirty buffers from a prior wipe bug — reload from disk instead.
      const hasRealDirty =
        !!t.isModified && typeof t.content === 'string' && t.content.length > 0;
      return {
        ...t,
        content: hasRealDirty ? t.content : null,
        originalContent: null,
        isModified: hasRealDirty,
        lastAccessed: Date.now(),
        status: hasRealDirty ? 'modified' : 'loaded',
      };
    });
    editorStore.setTabs(lazyTabs, parsed.activeTabId || null);
  } else {
    editorStore.setTabs([], null);
  }

  if (parsed.splitState) {
    const loadedSplit = parsed.splitState;
    const newPanes = Object.fromEntries(
      Object.entries(loadedSplit.panes).map(([paneId, p]: [string, any]) => {
        return [
          paneId,
          {
            ...p,
            tabs: (p as any).tabs.map((t: any) => lazyTabs.find((lt) => lt.id === t.id) || t),
          },
        ];
      })
    );
    splitStore.setState({ ...loadedSplit, panes: newPanes });
  } else if (lazyTabs.length > 0) {
    const snap = splitStore.getSnapshot();
    const paneId = snap.activePaneId;
    const pane = (snap as any).panes[paneId];
    splitStore.setState({
      ...snap,
      panes: {
        [paneId]: {
          ...pane,
          tabs: lazyTabs,
          activeTabId: parsed.activeTabId || null,
        },
      },
    });
  }

  const cursorStr = stateMap.get('cursor_scroll');
  if (cursorStr) {
    try {
      const cursorData = JSON.parse(cursorStr);
      for (const item of cursorData) {
        if (item.cursor) editorStore.updateCursor(item.id, item.cursor.line, item.cursor.column);
        if (item.scroll) editorStore.updateScroll(item.id, item.scroll.top, item.scroll.left);
      }
    } catch {
      // ignore malformed cursor data
    }
  }
}

export async function loadActiveTabContent(): Promise<void> {
  const currentActiveTab = editorStore.getTabsSnapshot().find(
    (t: any) => t.id === editorStore.getActiveTabIdSnapshot()
  );
  if (!currentActiveTab?.path || currentActiveTab.path.startsWith('Untitled')) return;

  // Reload when content was never loaded (null), OR when a prior bug persisted
  // an empty dirty buffer (content === '' + isModified). The empty-dirty case
  // used to skip this path and leave markdown preview/code permanently blank.
  const needsDiskReload =
    currentActiveTab.content === null ||
    (currentActiveTab.content === '' && currentActiveTab.isModified);

  if (!needsDiskReload) return;

  const tabId = currentActiveTab.id;
  const path = currentActiveTab.path;
  editorStore.setTabLoading(tabId, true);
  try {
    const content = await invoke<string>('read_file_text', { path });
    editorStore.setInitialContent(tabId, content);
  } catch (err) {
    if (String(err) === '__BINARY__') {
      editorStore.setTabUnsupported(tabId, true);
      editorStore.setInitialContent(tabId, '');
    } else if (String(err) === '__LARGE_FILE__') {
      const chunked = await invoke<any>('read_file_chunked', { path });
      editorStore.setInitialContent(tabId, chunked.content);
      editorStore.updateTab(tabId, { isLargeFile: true, isPreview: true });
    } else {
      console.error('Failed to load active tab content:', err);
    }
  }
  editorStore.setTabLoading(tabId, false);
  const updatedTab = editorStore.getTabsSnapshot().find((t: any) => t.id === tabId);
  if (updatedTab) splitStore.updateTabInAllPanes(updatedTab);
}