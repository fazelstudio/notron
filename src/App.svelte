<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { open, save } from '@tauri-apps/plugin-dialog';
  import { listen } from '@tauri-apps/api/event';
  import { editorStore } from './lib/stores/editor';
  import { uiStore } from './lib/stores/ui';
  import { getHumanReadableError } from './lib/utils/error';
  import { settingsStore } from './lib/stores/settings.svelte';
  import { themeStore } from './lib/stores/theme';
  import FileTree from './lib/components/explorer/FileTree.svelte';
  import Tooltip from './lib/components/common/Tooltip.svelte';
  import TitleMenuBar from './lib/components/panels/TitleMenuBar.svelte';
  import CloseTabDialog from './lib/components/panels/CloseTabDialog.svelte';
  import WelcomeTab from './lib/components/editor/WelcomeTab.svelte';
  import NewFileDialog from './lib/components/panels/NewFileDialog.svelte';
  import TrustModal from './lib/components/panels/TrustModal.svelte';
  import RecentFoldersModal from './lib/components/panels/RecentFoldersModal.svelte';
  import BottomPanel from './lib/components/panels/BottomPanel.svelte';
  import ToastContainer from './lib/components/common/ToastContainer.svelte';

  import SplitView from './lib/components/editor/SplitView.svelte';
  import { terminalStore } from './lib/stores/terminal';
  import { paletteStore, type PaletteItem } from './lib/stores/palette';
  import { navigationStore, canGoBack, canGoForward } from './lib/stores/navigation';
  import { gitDecorationStore } from './lib/stores/gitDecoration';
  import { gitRepoStore } from './lib/stores/gitRepo';
  import { sourceControlStore } from './lib/stores/sourceControl';
  import { splitStore } from './lib/stores/split';
  import {
    UNTITLED_PREFIX,
    UNKNOWN_NAME,
    IMAGE_EXT_RE,
    BINARY_SENTINEL,
    LARGE_FILE_SENTINEL,
    LARGE_FILE_THRESHOLD_BYTES,
    generateId,
  } from './lib/constants';
  import { formatLanguageName } from './lib/utils/languageDetector';
  import { createCancelableLoader } from './lib/utils/cancelableLoader';
  import { onMount } from 'svelte';

  /** Prevents race conditions when opening files in quick succession (ASYNC-003). */
  const fileOpenLoader = createCancelableLoader<any>();

  const tabs = editorStore.tabs;
  const activeTabId = editorStore.activeTabId;
  const saveStatus = editorStore.saveStatus;
  const ui = uiStore;

  let gitRepo = $derived($gitRepoStore.repo);
  let gitLoading = $derived($gitRepoStore.repoLoading || $gitRepoStore.syncing || $gitRepoStore.availabilityLoading);
  let gitChangesCount = $derived(gitRepo ? gitRepo.staged.length + repoUnstagedLength(gitRepo) + gitRepo.conflicted.length : 0);

  function repoUnstagedLength(repo: any) {
    return repo.unstaged.length + repo.untracked.length;
  }

  let closingTabId = $state<string | null>(null);
  let isClosingWindow = $state(false);
  let closeQueue = $state<string[]>([]);
  let pendingCloseConfirmed = $state(false);
  let isCommandPaletteOpen = $state(false);
  let commandPaletteInitialQuery = $state('');
  let isSettingsOpen = $state(false);
  let isGoToLineOpen = $state(false);
  let appReady = $state(false);
  let currentCursorPos = $state('');
  let isMaximized = $state(false);

  let CommandPaletteComponent = $state<any>(null);
  let SettingsPageComponent = $state<any>(null);
  let GoToLineComponent = $state<any>(null);
  let SearchPanelComponent = $state<any>(null);
  let SourceControlPanelComponent = $state<any>(null);
  let RunPanelComponent = $state<any>(null);
  let MarkdownPreviewComponent = $state<any>(null);
  let ImageViewerComponent = $state<any>(null);
  let ImageDiffComponent = $state<any>(null);
  let EditorComponent = $state<any>(null);
  let DiffEditorComponent = $state<any>(null);

  let activeTab = $derived($tabs.find((t: any) => t.id === $activeTabId) || null);
  let isDark = $derived($themeStore.isDark);

  $effect(() => {
    const workspacePath = $ui.explorerRoot;
    const folderName = workspacePath ? workspacePath.split(/[/\\]/).pop() : null;
    let windowTitle = "Notron";

    if (folderName && activeTab?.name) {
      windowTitle = `${activeTab.name} - ${folderName} - Notron`;
    } else if (folderName) {
      windowTitle = `${folderName} - Notron`;
    }

    document.title = windowTitle;
    getCurrentWindow().setTitle(windowTitle).catch(() => {});
  });

  $effect(() => {
    const appWindow = getCurrentWindow();
    const syncMaximized = () => appWindow.isMaximized().then((v) => { isMaximized = v; }).catch(() => {});
    syncMaximized();
    const unlisten = appWindow.onResized(syncMaximized);
    return () => { unlisten.then((fn) => fn()).catch(() => {}); };
  });

  // Record navigation history when active tab changes — but only when the
  // tab switch is user-initiated.  navigateBack / navigateForward set a
  // "navigating" flag so the programmatic tab switch is NOT double-recorded.
  let lastActiveTabId = $state<string | null>(null);
  $effect(() => {
    const tabId = $activeTabId;
    if (!tabId || tabId === lastActiveTabId) return;
    if (navigationStore.isNavigating()) {
      lastActiveTabId = tabId;
      return;
    }

    // Record OLD tab position before switching (NAV-002)
    if (lastActiveTabId) {
      const oldTab = $tabs.find((t: any) => t.id === lastActiveTabId);
      if (oldTab && oldTab.path && !oldTab.path.startsWith('Untitled') && oldTab.language !== 'welcome' && oldTab.language !== 'settings') {
        const oldCursor = editorStore.getCursor(lastActiveTabId);
        navigationStore.recordNavigation(
          oldTab.path,
          oldCursor?.line || 1,
          oldCursor?.column || 1
        );
      }
    }

    // Record NEW tab position
    const tab = $tabs.find((t: any) => t.id === tabId);
    if (tab && tab.path && !tab.path.startsWith('Untitled') && tab.language !== 'welcome' && tab.language !== 'settings') {
      const cursor = editorStore.getCursor(tabId);
      navigationStore.recordNavigation(
        tab.path,
        cursor?.line || 1,
        cursor?.column || 1
      );
    }
    lastActiveTabId = tabId;
  });

  // Intercept window close: prompt for unsaved changes before closing.
  // Tauri's onCloseRequested wrapper destroys the window when the handler does
  // NOT call event.preventDefault(). Closes are therefore forced with
  // destroy() (not a re-entrant close()) so the guard flag + beforeunload stay
  // consistent and the window reliably shuts down.
  $effect(() => {
    const appWindow = getCurrentWindow();
    const unlisten = appWindow.onCloseRequested((event) => {
      // A close was already confirmed earlier, so stop guarding the window.
      if (pendingCloseConfirmed) return;

      const modified = editorStore.getTabsSnapshot().filter((t: any) =>
        t.isModified || (t.path.startsWith('Untitled') && t.content && t.content.trim() !== '')
      );

      // No unsaved changes → close the window immediately, persisting the
      // session and clearing the crash flag so next launch isn't flagged as
      // "unexpected close".
      if (modified.length === 0) {
        event.preventDefault();
        pendingCloseConfirmed = true;
        saveWorkspaceSession().then(() => {
          invoke('set_crash_flag', { value: false }).catch(() => {});
          appWindow.destroy();
        });
        return;
      }

      // Unsaved changes → block the close and prompt the user.
      event.preventDefault();
      isClosingWindow = true;
      closeQueue = modified.map((t: any) => t.id);
      closingTabId = closeQueue[0];
    });
    return () => { unlisten.then((fn) => fn()).catch(() => {}); };
  });

  $effect(() => {
    if (settingsStore.effectiveSettings.theme) {
      themeStore.setTheme(settingsStore.effectiveSettings.theme);
    }
  });

  // Material icons are bundled inline (see materialIconAssets.ts), so no
  // cache warm-up is needed — first renders are synchronous by design.

  // Lazy load components only when needed (Bagian 17.1)
  $effect(() => {
    if (isCommandPaletteOpen && !CommandPaletteComponent) {
      import('./lib/components/panels/CommandPalette.svelte').then(m => CommandPaletteComponent = m.default);
    }
  });
  $effect(() => {
    if (isSettingsOpen && !SettingsPageComponent) {
      import('./lib/components/panels/SettingsPage.svelte').then(m => SettingsPageComponent = m.default);
    }
  });
  $effect(() => {
    if (isGoToLineOpen && !GoToLineComponent) {
      import('./lib/components/editor/GoToLineDialog.svelte').then(m => GoToLineComponent = m.default);
    }
  });
  $effect(() => {
    if ($ui.activeSidebarPanel === 'search' && $ui.isSidebarOpen && !SearchPanelComponent) {
      import('./lib/components/panels/SearchPanel.svelte').then(m => SearchPanelComponent = m.default);
    }
    if ($ui.activeSidebarPanel === 'git' && $ui.isSidebarOpen && !SourceControlPanelComponent) {
      import('./lib/components/panels/SourceControlPanel.svelte').then(m => SourceControlPanelComponent = m.default);
    }
    if ($ui.activeSidebarPanel === 'run' && $ui.isSidebarOpen && !RunPanelComponent) {
      import('./lib/components/panels/RunPanel.svelte').then(m => RunPanelComponent = m.default);
    }
  });

  let gotoRetryTimer: ReturnType<typeof setInterval> | null = null;

  // Dispatch a goto/highlight action that retries until the target line is
  // loaded. Files stream in chunks (large files), so the line may not exist in
  // the editor's document yet on the first attempt — re-sending until the
  // editor can actually apply it (Editor ignores lines beyond EOF) makes the
  // jump land reliably instead of being dropped on a still-loading tab.
  function dispatchGotoWithRetry(line: number, column?: number, endColumn?: number) {
    const fire = () => {
      window.dispatchEvent(new CustomEvent('editor:action', {
        detail: { action: 'goto', line, column, endColumn }
      }));
    };
    fire();
    if (gotoRetryTimer) clearInterval(gotoRetryTimer);
    let attempts = 0;
    gotoRetryTimer = setInterval(() => {
      if (++attempts >= 30) {
        clearInterval(gotoRetryTimer!);
        gotoRetryTimer = null;
        return;
      }
      fire();
    }, 100);
  }

  onMount(() => {
    const switchHandler = async (e: Event) => {
      const path = (e as CustomEvent).detail?.path;
      if (path) {
        await saveWorkspaceSession();
        navigationStore.reset();
        uiStore.setExplorerRoot(path);
      }
    };
    window.addEventListener('request-workspace-switch', switchHandler);
    
    // Split pane / file operations
    window.addEventListener('request-open-file', async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const path = detail?.path;
      const line = detail?.line;
      if (path) {
        await openFileInActivePane(path);
        if (line) {
          dispatchGotoWithRetry(line, detail?.column, detail?.endColumn);
        }
      }
    });
    window.addEventListener('request-open-file-split', async (e: Event) => {
      const path = (e as CustomEvent).detail?.path;
      if (path) {
        const snap = splitStore.getSnapshot();
        const activeId = snap.activePaneId;
        if (activeId) splitStore.splitPane(activeId, 'right');
        await openFileInActivePane(path);
      }
    });
    window.addEventListener('split:request-close-tab', (e: Event) => {
      const { tabId } = (e as CustomEvent).detail;
      const tab = editorStore.getTabsSnapshot().find((t: any) => t.id === tabId);
      if (!tab) return;
      if (tab.isModified || (tab.path.startsWith(UNTITLED_PREFIX) && tab.content && tab.content.trim() !== '')) {
        closingTabId = tabId;
      } else {
        editorStore.closeTabEverywhere(tabId);
      }
    });

    const focusHandler = async () => {
      if (!appReady) return;
      gitRepoStore.refreshRepoOnly();
      const currentTabs = editorStore.getTabsSnapshot();
      
      // Only stat-check physical disk files (tab.id === tab.path)
      // This prevents virtual/git tabs (e.g. C:\file::working-tree:D) from being erroneously marked as deleted
      const diskTabs = currentTabs.filter((t: any) => t.id === t.path && !t.path.startsWith('Untitled') && t.status !== 'deleted');
      const paths = diskTabs.map((t: any) => t.path);
      
      if (paths.length === 0) return;
      
      try {
        const metadata = await invoke<any[]>('get_files_metadata', { paths });
        const existingPaths = new Set(metadata.map(m => m.path));
        
        diskTabs.forEach((tab: any) => {
          if (!existingPaths.has(tab.path)) {
            editorStore.markTabDeleted(tab.id);
          }
        });
      } catch (err) { console.error('Focus sync failed:', err); }
    };
    window.addEventListener('focus', focusHandler);

    return () => {
      window.removeEventListener('request-workspace-switch', switchHandler);
      window.removeEventListener('focus', focusHandler);
    };
  });
  $effect(() => {
    if (activeTab && (activeTab.language === 'markdown-preview' || activeTab.language === 'markdown' || activeTab.path.toLowerCase().endsWith('.md')) && !MarkdownPreviewComponent) {
      import('./lib/components/editor/MarkdownPreview.svelte').then(m => MarkdownPreviewComponent = m.default);
    }
  });
  $effect(() => {
    if ((activeTab?.language === 'image' || activeTab?.path.toLowerCase().endsWith('.svg')) && !ImageViewerComponent) {
      import('./lib/components/editor/ImageViewer.svelte').then(m => ImageViewerComponent = m.default);
    }
  });



  $effect(() => {
    $cursorSignal;
    if (activeTab) {
      const cursor = editorStore.getCursor(activeTab.id);
      currentCursorPos = cursor
        ? `Ln ${cursor.line}, Col ${cursor.column}`
        : '';
    } else {
      currentCursorPos = '';
    }
  });

  // === Workspace State Persistence (Bagian 3) ===
  // Debounce timers for different data types
  let cursorScrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let expandStateSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let fullSessionSaveTimer: ReturnType<typeof setTimeout> | null = null;

  async function saveWorkspaceSession() {
    const explorerRoot = uiStore.getSnapshot().explorerRoot;
    if (!explorerRoot) return;
    try {
      const uiVal = uiStore.getSnapshot();
      const tabsSnapshot = editorStore.getTabsSnapshot();
      const termVal = terminalStore.getSnapshot();

      const validTabs = tabsSnapshot.filter((t: any) => 
        t.language !== 'welcome' &&
        (t.path.startsWith('Untitled') || 
        t.path.toLowerCase().startsWith(explorerRoot.toLowerCase()))
      );
      const validTabIds = new Set(validTabs.map((t: any) => t.id));
      let activeTabId = editorStore.getActiveTabIdSnapshot();
      if (activeTabId && !validTabIds.has(activeTabId)) {
        activeTabId = validTabs.length > 0 ? validTabs[0].id : null;
      }

      const rawSplitState = splitStore.getSnapshot();
      const sanitizedSplitState = {
        ...rawSplitState,
        panes: Object.fromEntries(Object.entries(rawSplitState.panes).map(([k, v]) => [
          k,
          {
            ...v,
            tabs: v.tabs.map((t: any) => ({
              id: t.id, path: t.path, name: t.name, language: t.language,
              isPreview: t.isPreview, isPinned: t.isPinned,
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
            }))
          }
        ]))
      };

      const session = {
        sidebarWidth: uiVal.sidebarWidth,
        isSidebarOpen: uiVal.isSidebarOpen,
        expandedPaths: uiStore.getExpandedPathsSnapshot(),
        activeSidebarPanel: uiVal.activeSidebarPanel,
        isMinimapEnabled: uiVal.isMinimapEnabled,
        searchQuery: uiVal.searchQuery,
        replaceQuery: uiVal.replaceQuery,
        terminals: termVal.terminals,
        activeTerminalId: termVal.activeTerminalId,
        terminalVisible: termVal.isVisible,
        terminalMaximized: termVal.isMaximized,
        terminalHeight: termVal.height,
        terminalActivePanel: termVal.activePanel,
        tabs: validTabs.map((t: any) => ({
          id: t.id, path: t.path, name: t.name, language: t.language,
          isPreview: t.isPreview, isPinned: t.isPinned, 
          cursor: editorStore.getCursor(t.id), scroll: editorStore.getScroll(t.id),
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

      // Section 1.1: Save to both legacy table AND tiered tables in parallel
      await Promise.all([
        // Legacy (backward compat)
        invoke('save_workspace_session', {
          workspacePath: explorerRoot,
          sessionJson: JSON.stringify(session),
        }),
        // Tier 2: UI State
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
        // Tier 3: Session State
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
          tabs: session.tabs.filter((t: any) => t.isModified && t.content !== undefined && !t.isLargeFile).map((t: any) => ({
            path: t.path,
            content: t.content,
            cursor_pos: t.cursor?.line || 0,
          }))
        }).catch(() => {}),
      ]);
    } catch (err) {
      console.error("Failed to save workspace session:", err);
    }
  }

  async function saveCursorScroll() {
    const explorerRoot = uiStore.getSnapshot().explorerRoot;
    if (!explorerRoot) return;
    const cursorData = editorStore.getCursorScrollSnapshot();
    try {
      await invoke('save_workspace_state', {
        workspacePath: explorerRoot,
        pairs: [['cursor_scroll', JSON.stringify(cursorData)]],
      });
    } catch (err) {
      console.error("Failed to save cursor/scroll:", err);
    }
  }

  async function saveExpandedState() {
    const explorerRoot = uiStore.getSnapshot().explorerRoot;
    if (!explorerRoot) return;
    const paths = uiStore.getExpandedPathsSnapshot();
    try {
      await invoke('save_workspace_expanded_paths', {
        workspacePath: explorerRoot,
        pathsJson: JSON.stringify(paths),
      });
    } catch (err) {
      console.error("Failed to save expanded paths:", err);
    }
  }

  // Debounced save for cursor/scroll (3 second debounce per Bagian 3.3)
  function debouncedSaveCursorScroll() {
    if (cursorScrollSaveTimer) clearTimeout(cursorScrollSaveTimer);
    cursorScrollSaveTimer = setTimeout(saveCursorScroll, 3000);
  }

  // Debounced save for expanded folders (1 second debounce)
  function debouncedSaveExpanded() {
    if (expandStateSaveTimer) clearTimeout(expandStateSaveTimer);
    expandStateSaveTimer = setTimeout(saveExpandedState, 1000);
  }

  // Full session save with 2 second debounce
  function debouncedSaveFullSession() {
    if (fullSessionSaveTimer) clearTimeout(fullSessionSaveTimer);
    fullSessionSaveTimer = setTimeout(saveWorkspaceSession, 2000);
  }

  // 0.6 — record a frontend startup phase in the Rust StartupTimers store,
  // queryable later via `get_startup_timers`.
  function recordStartupPhase(name: string) {
    invoke('record_startup_timer', { name }).catch(() => {});
  }

  // ============================================================
  // Section 1.2: Shell-First Rendering + Tiered State Loading
  // Section 1.4 + 6.1: IPC Batching — all startup queries in ONE round-trip
  // ============================================================
  /** Apply a parsed workspace session to the stores. Shared by the initial
   *  startup and workspace-switch paths so both restore the SAME state
   *  (layout, terminal, tabs, split panes, cursor/scroll) — previously the
   *  switch path forgot the split panes, leaving stale tabs on screen. */
  function applySessionState(parsed: any, stateMap: Map<string, string>) {
    // Start from a clean single pane — on a workspace switch the old split
    // layout must not leak into the new workspace.
    splitStore.resetToSinglePane();

    if (parsed.sidebarWidth !== undefined) uiStore.setSidebarWidth(parsed.sidebarWidth);
    if (parsed.isSidebarOpen !== undefined) uiStore.setSidebarOpen(parsed.isSidebarOpen);
    if (parsed.expandedPaths !== undefined) uiStore.setExpandedPaths(parsed.expandedPaths);
    if (parsed.activeSidebarPanel !== undefined) uiStore.setActiveSidebarPanel(parsed.activeSidebarPanel);
    if (parsed.isMinimapEnabled !== undefined) uiStore.setMinimapEnabled(parsed.isMinimapEnabled);
    if (parsed.searchQuery !== undefined) uiStore.setSearchQuery(parsed.searchQuery);
    if (parsed.replaceQuery !== undefined) uiStore.setReplaceQuery(parsed.replaceQuery);

    terminalStore.setTerminals(parsed.terminals || [], parsed.activeTerminalId || null);
    if (parsed.terminalMaximized !== undefined) terminalStore.setMaximize(parsed.terminalMaximized);
    if (parsed.terminalHeight !== undefined) terminalStore.setHeight(parsed.terminalHeight);
    if (parsed.terminalActivePanel !== undefined) terminalStore.setActivePanel(parsed.terminalActivePanel);
    if (parsed.terminalVisible !== undefined) terminalStore.setVisibility(parsed.terminalVisible);
    if (parsed.sourceControlState !== undefined) sourceControlStore.hydrate(parsed.sourceControlState);

    // Lazy Tab Initialization
    let lazyTabs: any[] = [];
    if (parsed.tabs && parsed.tabs.length > 0) {
      lazyTabs = parsed.tabs.map((t: any) => ({
        ...t,
        content: t.isModified && t.content !== undefined ? t.content : null,
        originalContent: null,
        lastAccessed: Date.now(),
        status: t.isModified && t.content !== undefined ? 'modified' : 'loaded',
      }));
      editorStore.setTabs(lazyTabs, parsed.activeTabId || null);
    } else {
      editorStore.setTabs([], null);
    }

    if (parsed.splitState) {
      const loadedSplit = parsed.splitState;
      const newPanes = Object.fromEntries(
        Object.entries(loadedSplit.panes).map(([paneId, p]: [string, any]) => {
          return [paneId, {
            ...p,
            tabs: p.tabs.map((t: any) => lazyTabs.find(lt => lt.id === t.id) || t)
          }];
        })
      );
      splitStore.setState({ ...loadedSplit, panes: newPanes });
    } else if (lazyTabs.length > 0) {
      // Migration from older flat session
      const snap = splitStore.getSnapshot();
      const paneId = snap.activePaneId;
      const pane = snap.panes[paneId];
      splitStore.setState({
        ...snap,
        panes: {
          [paneId]: {
            ...pane,
            tabs: lazyTabs,
            activeTabId: parsed.activeTabId || null
          }
        }
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
      } catch { /* ignore */ }
    }
  }

  async function stagedStartup() {
    // Phase 0: Shell renders immediately (appReady=false shows skeleton)
    // Theme + dimensions already loaded from localStorage (sync)
    appReady = false;
    recordStartupPhase('frontend-start');

    const root = uiStore.getSnapshot().explorerRoot;

    // Hoisted so the crash-recovery phase (outside the try block) can read it.
    let crashFlag = false;

    try {
      // Phase 2: Single IPC round-trip for ALL startup state
      const startupState = await invoke<{
        config: any;
        critical: any;
        ui_state: any | null;
        session_pairs: [string, string][];
        global_settings: Record<string, any>;
        workspace_settings: Record<string, any>;
        crash_flag: boolean;
      }>('load_startup_state', { workspaceId: root || null });

      // Apply settings from the folded startup payload (no extra round-trips)
      settingsStore.applyLoadedSettings(
        startupState.global_settings,
        startupState.workspace_settings,
        root || undefined
      );

      // Capture crash flag before leaving the try block's scope
      crashFlag = startupState.crash_flag === true;

      // Apply UI state from DB (overrides localStorage if available)
      if (startupState.ui_state) {
        const u = startupState.ui_state;
        if (u.sidebar_width != null) uiStore.setSidebarWidth(Number(u.sidebar_width));
        if (u.sidebar_visible != null) uiStore.setSidebarOpen(Boolean(u.sidebar_visible));
        if (u.active_sidebar_panel) uiStore.setActiveSidebarPanel(u.active_sidebar_panel);
        if (u.is_minimap_enabled != null) uiStore.setMinimapEnabled(Boolean(u.is_minimap_enabled));
        if (u.expanded_folder_paths) {
          try { uiStore.setExpandedPaths(JSON.parse(u.expanded_folder_paths)); } catch {}
        }
      }

      if (startupState.session_pairs && startupState.session_pairs.length > 0) {
        const stateMap = new Map<string, string>(startupState.session_pairs);
        const sessionStr = stateMap.get('session');
        if (sessionStr) {
          try {
            const parsed = JSON.parse(sessionStr);
            applySessionState(parsed, stateMap);
          } catch (e) {
            console.error('Failed to parse session state', e);
            editorStore.setTabs([], null);
          }
        } else {
          editorStore.setTabs([], null);
        }
      } else {
        editorStore.setTabs([], null);
        uiStore.setExpandedPaths([]);
      }
    } catch (err) {
      console.error('Startup state load failed:', err);
      editorStore.setTabs([], null);
    }

    recordStartupPhase('frontend-state-loaded');

    appReady = true;
    if (root) {
      gitRepoStore.setWorkspace(root);
    }
    recordStartupPhase('frontend-ready');
    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          invoke('show_main_window').catch(e => console.error('Failed to show window', e));
        });
      });
    }, 150);

    // Phase 3: Load active tab content + show welcome if no tabs
    await loadActiveTabContent();

    if ($tabs.length === 0) {
      if (root) {
        editorStore.addTab({
          id: 'welcome', path: 'Welcome', name: 'Welcome',
          content: 'Welcome to Notron', language: 'welcome', isPreview: true
        });
        editorStore.setActiveTab('welcome');
      }
    }

    // Phase 4: Crash Recovery Check (flag is now included in startup state)
    try {
      if (crashFlag) {
        try {
          const dirtySnapshots = await invoke<any[]>('get_dirty_tab_snapshots');
          if (dirtySnapshots && dirtySnapshots.length > 0) {
            dirtySnapshots.forEach(snap => {
              const name = snap.path.split(/[/\\]/).pop() || 'Unknown';
              const id = snap.path;
              // Check if already in tabs
              const existingTab = editorStore.getTabsSnapshot().find((t: any) => t.id === id);
              if (!existingTab) {
                editorStore.addTab({
                  id, path: snap.path, name, content: snap.content, language: 'plaintext', languageDetected: false, isPreview: false
                });
              } else {
                editorStore.setInitialContent(id, snap.content);
              }
              // Mark as modified so it can be saved again
              editorStore.updateContent(id, snap.content);
            });
            uiStore.addToast('Session restored', 'success', 'after unexpected close');
          } else {
            uiStore.addToast('Session restored', 'success', 'after unexpected close');
          }
        } catch(e) {}
      }
      await invoke('set_crash_flag', { value: true });
    } catch (e) {
      console.error('Failed to check/set crash flag', e);
    }

    // Phase 5: Background tasks via requestIdleCallback
    scheduleBackgroundTasks();
    recordStartupPhase('frontend-done');
  }

  function scheduleBackgroundTasks() {
    const idle = (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
    // Prefetch CommandPalette component
    idle(() => {
      if (!CommandPaletteComponent) {
        import('./lib/components/panels/CommandPalette.svelte').then(m => CommandPaletteComponent = m.default);
      }
    });
    // Prefetch Editor component
    idle(() => {
      if (!EditorComponent) {
        import('./lib/components/editor/Editor.svelte').then(m => EditorComponent = m.default);
      }
    });
    // Warm the file index for Ctrl+P in the background (non-blocking)
    idle(() => {
      if (uiStore.getSnapshot().explorerRoot) {
        ensurePaletteLoaded();
      }
    });
  }

  async function loadActiveTabContent() {
    const currentActiveTab = editorStore.getTabsSnapshot().find(
      (t: any) => t.id === editorStore.getActiveTabIdSnapshot()
    );
    if (currentActiveTab && currentActiveTab.content === null &&
        currentActiveTab.path && !currentActiveTab.path.startsWith('Untitled')) {
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
          // Set isLargeFile to true and disable editing to prevent data loss
          editorStore.updateTab(tabId, { isLargeFile: true, isPreview: true });
        } else {
          console.error('Failed to load active tab content:', err);
        }
      }
      editorStore.setTabLoading(tabId, false);
      // Sync the fully-loaded tab (including content) to all split panes so
      // that SplitEditorPane's activeTab.content is never left as null after
      // the startup load — previously only isLoading was synced here, causing
      // the Markdown preview to appear blank until the pane's own lazy-loader
      // fired a second IPC read.
      const updatedTab = editorStore.getTabsSnapshot().find((t: any) => t.id === tabId);
      if (updatedTab) splitStore.updateTabInAllPanes(updatedTab);
    }
  }

  async function loadWorkspaceState(root: string) {
    appReady = false;
    try {
      const startupState = await invoke<{
        config: any;
        critical: any;
        ui_state: any | null;
        session_pairs: [string, string][];
        global_settings: Record<string, any>;
        workspace_settings: Record<string, any>;
        crash_flag: boolean;
      }>('load_startup_state', { workspaceId: root || null });

      settingsStore.applyLoadedSettings(
        startupState.global_settings,
        startupState.workspace_settings,
        root
      );

      if (startupState.ui_state) {
        const u = startupState.ui_state;
        if (u.sidebar_width != null) uiStore.setSidebarWidth(Number(u.sidebar_width));
        if (u.sidebar_visible != null) uiStore.setSidebarOpen(Boolean(u.sidebar_visible));
        if (u.active_sidebar_panel) uiStore.setActiveSidebarPanel(u.active_sidebar_panel);
        if (u.is_minimap_enabled != null) uiStore.setMinimapEnabled(Boolean(u.is_minimap_enabled));
        if (u.expanded_folder_paths) {
          try { uiStore.setExpandedPaths(JSON.parse(u.expanded_folder_paths)); } catch {}
        }
      }

      if (startupState.session_pairs && startupState.session_pairs.length > 0) {
        const stateMap = new Map<string, string>(startupState.session_pairs);
        const sessionStr = stateMap.get('session');
        if (sessionStr) {
          try {
            const parsed = JSON.parse(sessionStr);
            applySessionState(parsed, stateMap);
          } catch (e) {
            console.error('Failed to parse session state', e);
            editorStore.setTabs([], null);
          }
        } else {
          editorStore.setTabs([], null);
        }
      } else {
        editorStore.setTabs([], null);
        uiStore.setExpandedPaths([]);
      }
    } catch (err) {
      console.error('Failed to load workspace state:', err);
    }
    appReady = true;
    await loadActiveTabContent();
  }



  // Content is loaded centrally: new opens go through `openFileInActivePane`
  // (tab first, content streamed in), and suspended/session-restored tabs are
  // re-read by SplitEditorPane's per-pane effect (which syncs the loaded
  // content back into the split store). No global lazy-load effect here —
  // a second one would race the per-pane loader with duplicate IPC reads.

  $effect(() => {
    if ((activeTab?.language === 'image' || activeTab?.path.toLowerCase().endsWith('.svg')) && !ImageViewerComponent) {
      import('./lib/components/editor/ImageViewer.svelte').then(m => ImageViewerComponent = m.default);
    }
  });

  $effect(() => {
    if (activeTab?.language === 'image-diff' && !ImageDiffComponent) {
      import('./lib/components/editor/ImageDiff.svelte').then(m => ImageDiffComponent = m.default);
    }
  });

  // Trigger EditorComponent lazy load as soon as a non-special tab exists (even with null content)
  $effect(() => {
    if (activeTab && activeTab.language !== 'markdown-preview' && activeTab.language !== 'image' && activeTab.language !== 'image-diff' && activeTab.language !== 'welcome' && !EditorComponent && !activeTab.isDiff) {
      import('./lib/components/editor/Editor.svelte').then(m => EditorComponent = m.default);
    }
    if (activeTab && activeTab.isDiff && activeTab.language !== 'image-diff' && !DiffEditorComponent) {
      import('./lib/components/editor/DiffEditor.svelte').then(m => DiffEditorComponent = m.default);
    }
  });

  function setSidebarWidth(w: number) { uiStore.setSidebarWidth(w); }

  function handleNewTextFile() {
    let count = 1;
    const tabsSnapshot = editorStore.getTabsSnapshot();
    while (tabsSnapshot.some((t: any) => t.path === `Untitled-${count}`)) count++;
    const name = `Untitled-${count}`;
    const id = `tab-${Date.now()}`;
    const tab = { id, path: name, name, content: '', language: 'plaintext', isPreview: false };
    editorStore.addTab(tab);
    editorStore.setActiveTab(id);
    const splitSnap = splitStore.getSnapshot();
    const activePaneId = splitSnap.activePaneId;
    if (activePaneId) {
      splitStore.addTabToPane(activePaneId, { ...tab, originalContent: '', isModified: false, lastAccessed: Date.now(), status: 'active' });
    }
  }

  /** Open a file and add it to the active split pane. VSCode-style: the tab
   *  opens immediately (no "Loading" placeholder — the editor stays blank)
   *  and content streams in from the background once the disk read finishes.
   *  This is the SINGLE entry point for every file-open path (explorer,
   *  palette, welcome, menu bar, search results). */
  async function openFileInActivePane(filePath: string) {
    const splitSnap = splitStore.getSnapshot();
    const activePaneId = splitSnap.activePaneId;
    const pane = activePaneId ? splitSnap.panes[activePaneId] : null;

    if (pane) {
      const existing = pane.tabs.find((t: any) => t.path === filePath);
      if (existing) {
        splitStore.setActivePaneTab(activePaneId, existing.id);
        editorStore.setActiveTab(existing.id);
        // If the tab content is null (e.g. suspended) and not already loading,
        // trigger a reload so the pane doesn't stay blank — SplitEditorPane's
        // effect only fires on activeTab changes, so if this tab was already
        // the activeTab before the click, the effect won't re-run on its own.
        if (existing.content === null && !existing.isLoading) {
          const tabId = existing.id;
          const path = existing.path;
          editorStore.setTabLoading(tabId, true);
          fileOpenLoader.load(async () => {
            try {
              return await invoke<string>('read_file_text', { path });
            } catch (e) {
              if (String(e) === BINARY_SENTINEL) return { __error: 'binary' as const };
              if (String(e) === LARGE_FILE_SENTINEL) {
                const chunked = await invoke<any>('read_file_chunked', { path });
                return { __error: 'large' as const, content: chunked.content };
              }
              throw e;
            }
          }).then(result => {
            if (result === undefined) return;
            if (result && typeof result === 'object' && '__error' in result) {
              if (result.__error === 'binary') {
                editorStore.setTabUnsupported(tabId, true);
                editorStore.setInitialContent(tabId, '');
              } else if (result.__error === 'large') {
                editorStore.setInitialContent(tabId, result.content);
                editorStore.updateTab(tabId, { isLargeFile: true, isPreview: true });
              }
            } else if (typeof result === 'string') {
              editorStore.setInitialContent(tabId, result);
            }
            editorStore.setTabLoading(tabId, false);
            const updatedTab = editorStore.getTabsSnapshot().find((t: any) => t.id === tabId);
            if (updatedTab) splitStore.updateTabInAllPanes(updatedTab);
          }).catch(err => {
            console.error('Failed to reload suspended tab:', err);
            editorStore.setTabLoading(tabId, false);
          });
        }
        return;
      }
    }

    const fileName = filePath.split(/[/\\]/).pop() || UNKNOWN_NAME;
    const isImage = IMAGE_EXT_RE.test(fileName);
    const id = generateId('tab');

    // Preview-replacement target is decided synchronously (before any await)
    // so the tab can mount before the first IPC round-trip completes.
    let tabToReplaceId: string | null = null;
    const currentPane = activePaneId ? splitSnap.panes[activePaneId] : null;
    if (currentPane && currentPane.activeTabId) {
      const activeTabObj = currentPane.tabs.find((t: any) => t.id === currentPane.activeTabId);
      // Replace if not modified. For 'Untitled', also ensure it doesn't have content.
      if (activeTabObj && !activeTabObj.isModified) {
        const isUntitledWithContent = activeTabObj.path.startsWith(UNTITLED_PREFIX)
          && activeTabObj.content && activeTabObj.content.trim() !== '';
        if (!isUntitledWithContent) {
          tabToReplaceId = activeTabObj.id;
        }
      }
    }

    const tab = {
      id,
      path: filePath,
      name: fileName,
      content: null as string | null,
      language: isImage ? 'image' : 'plaintext',
      languageDetected: false,
      isPreview: tabToReplaceId !== null,
      isLargeFile: false,
      // Marks that App itself drives the load — prevents the pane focus
      // effect from firing a duplicate read for the same tab.
      isLoading: !isImage,
    };

    if (tabToReplaceId) editorStore.closeTabEverywhere(tabToReplaceId);
    editorStore.addTab(tab);
    editorStore.setActiveTab(id);
    if (activePaneId) {
      if (tabToReplaceId) {
        splitStore.replaceTabInPane(activePaneId, tabToReplaceId, {
          ...tab,
          originalContent: null,
          isModified: false,
          lastAccessed: Date.now(),
          status: 'loaded',
        });
      } else {
        splitStore.addTabToPane(activePaneId, {
          ...tab,
          originalContent: null,
          isModified: false,
          lastAccessed: Date.now(),
          status: 'loaded',
        });
      }
    }

    if (isImage) return;

    // Background load: language first (for syntax highlighting), then content.
    // Wrapped in cancelableLoader (ASYNC-003) so rapid clicks don't cause a
    // stale file's content to overwrite the active tab.
    const language = await invoke<string>('detect_language', { path: filePath }).catch(() => 'plaintext');
    editorStore.updateTab(id, { language, languageDetected: true });
    splitStore.updateTabInAllPanes({ id, language, languageDetected: true });

    const content = await fileOpenLoader.load(async () => {
      try {
        return await invoke<string>('read_file_text', { path: filePath });
      } catch (e) {
        if (String(e) === BINARY_SENTINEL) return { __error: 'binary' as const };
        if (String(e) === LARGE_FILE_SENTINEL) {
          const chunked = await invoke<any>('read_file_chunked', { path: filePath });
          return { __error: 'large' as const, content: chunked.content };
        }
        throw e;
      }
    });

    // Superseded by a newer openFile call — discard silently
    if (content === undefined) return;

    if (content && typeof content === 'object' && '__error' in content) {
      if (content.__error === 'binary') {
        editorStore.setTabUnsupported(id, true);
        editorStore.setInitialContent(id, '');
        editorStore.setTabLoading(id, false);
        splitStore.updateTabInAllPanes({ id, isUnsupported: true, isLoading: false });
      } else if (content.__error === 'large') {
        editorStore.setInitialContent(id, content.content);
        editorStore.updateTab(id, { isLargeFile: true, isPreview: true });
        editorStore.setTabLoading(id, false);
        splitStore.updateTabInAllPanes({ id, isLargeFile: true, isPreview: true });
      }
    } else if (typeof content === 'string') {
      editorStore.setInitialContent(id, content);
      editorStore.setTabLoading(id, false);
      splitStore.updateTabInAllPanes(editorStore.getTabsSnapshot().find((t: any) => t.id === id) || { id });
      // Detect encoding & line ending (CORE-005) — fire-and-forget, non-blocking
      invoke<{ encoding: string; line_ending: string }>('get_file_encoding_info', { path: filePath })
        .then(info => {
          editorStore.updateTab(id, { encoding: info.encoding, lineEnding: info.line_ending });
          splitStore.updateTabInAllPanes({ id, encoding: info.encoding, lineEnding: info.line_ending });
        })
        .catch(() => { /* best effort */ });
    }
  }


  function openSettings() {
    isSettingsOpen = true;
  }

  const baseCommands: PaletteItem[] = [
    {
      id: 'new-file', label: 'New File', category: 'command', shortcut: 'Ctrl+N',
      action: handleNewTextFile, keywords: ['create', 'buat', 'file baru']
    },
    { id: 'toggle-sidebar', label: 'Toggle Sidebar', category: 'command', shortcut: 'Ctrl+B', action: () => uiStore.toggleSidebar() },
    { id: 'settings', label: 'Settings', category: 'command', shortcut: 'Ctrl+,', action: openSettings },
    { id: 'go-to-line', label: 'Go to Line', category: 'command', shortcut: 'Ctrl+G', action: () => isGoToLineOpen = true },
    {
      id: 'go-back', label: 'Go Back', category: 'command', shortcut: 'Alt+Left',
      action: () => navigationStore.navigateBack(), keywords: ['navigate', 'back', 'history']
    },
    {
      id: 'go-forward', label: 'Go Forward', category: 'command', shortcut: 'Alt+Right',
      action: () => navigationStore.navigateForward(), keywords: ['navigate', 'forward', 'history']
    },
    {
      id: 'run-config', label: 'Run: Start Configuration', category: 'command', shortcut: 'F5',
      action: () => import('./lib/services/runService').then(m => m.runSelectedConfiguration()),
      keywords: ['run', 'jalankan', 'launch', 'debug', 'terminal']
    },
    {
      id: 'run-current-file', label: 'Run: Current File', category: 'command', shortcut: 'Ctrl+F5',
      action: () => import('./lib/services/runService').then(m => m.runCurrentFile()),
      keywords: ['run', 'jalankan', 'file aktif', 'execute']
    },
    {
      id: 'run-stop', label: 'Run: Stop', category: 'command', shortcut: 'Shift+F5',
      action: () => import('./lib/services/runService').then(m => m.stopActiveRuns()),
      keywords: ['stop', 'hentikan', 'kill', 'terminate']
    }
  ];

  // Palette file index is built lazily (on first palette open) so startup never
  // blocks on a full workspace walk. An idle prefetch warms it afterwards.
  let paletteLoadedFor = $state<string | null>(null);

  function openFileFromPalette(path: string) {
    void openFileInActivePane(path);
  }

  function ensurePaletteLoaded() {
    const root = uiStore.getSnapshot().explorerRoot;
    if (root) {
      if (paletteLoadedFor === root) return;
      paletteLoadedFor = root;
      paletteStore.loadWorkspaceFiles(root, baseCommands, openFileFromPalette);
    } else {
      paletteStore.initItems(baseCommands);
    }
  }

  function openCommandPalette(initialQuery = '') {
    commandPaletteInitialQuery = initialQuery;
    ensurePaletteLoaded();
    isCommandPaletteOpen = true;
  }

  async function handleOpenFolder() {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        if (selected === uiStore.getSnapshot().explorerRoot) return;
        if (!$ui.recentWorkspaces.includes(selected)) {
          await saveWorkspaceSession();
          uiStore.setPendingTrustPath(selected);
        } else {
          window.dispatchEvent(new CustomEvent('request-workspace-switch', { detail: { path: selected } }));
        }
      }
    } catch (err) { console.error("Failed to open folder:", err); }
  }

  async function handleOpenFile() {
    try {
      const selected = await open({ multiple: false });
      if (selected && typeof selected === 'string') {
        await openFileInActivePane(selected);
      }
    } catch (err) { console.error('Failed to open file:', err); }
  }

  function handleOpenTerminal() {
    const snap = terminalStore.getSnapshot();
    if (snap.terminals.length === 0) {
      terminalStore.newTerminal(undefined, uiStore.getSnapshot().explorerRoot || '');
    } else {
      terminalStore.setVisibility(true);
    }
  }

  function handleTabClose(tabId: string) {
    const tab = $tabs.find((t: any) => t.id === tabId);
    if (!tab) return;
    if (tab.isModified || (tab.path.startsWith(UNTITLED_PREFIX) && tab.content && tab.content.trim() !== '')) {
      closingTabId = tabId;
    } else {
      editorStore.closeTabEverywhere(tabId);
      debouncedSaveFullSession();
    }
  }

  function advanceCloseQueue() {
    closeQueue = closeQueue.slice(1);
    if (closeQueue.length > 0) {
      closingTabId = closeQueue[0];
    } else {
      isClosingWindow = false;
      closingTabId = null;
      pendingCloseConfirmed = true;
      // Persist the session + clear the crash flag, then force-close. destroy()
      // bypasses beforeunload, so save explicitly instead of relying on it.
      saveWorkspaceSession().then(() => {
        invoke('set_crash_flag', { value: false }).catch(() => {});
        getCurrentWindow().destroy();
      });
    }
  }

  function handleCloseDialogCancel() {
    if (isClosingWindow) {
      isClosingWindow = false;
      closeQueue = [];
    }
    closingTabId = null;
  }

  function handleCloseDialogDontSave() {
    if (!closingTabId) return;
    editorStore.closeTabEverywhere(closingTabId);
    if (isClosingWindow) {
      advanceCloseQueue();
    } else {
      closingTabId = null;
      debouncedSaveFullSession();
    }
  }

  async function handleCloseSave() {
    if (!closingTabId) return;
    const tab = $tabs.find((t: any) => t.id === closingTabId);
    if (!tab) { closingTabId = null; return; }
    try {
      if (tab.path.startsWith('Untitled')) {
        const selected = await save();
        if (!selected || typeof selected !== 'string') return;
        await invoke('save_file', { path: selected, content: tab.content ?? '' });
      } else {
        if (tab.content !== null) {
          await invoke('save_file', { path: tab.path, content: tab.content });
        }
      }
    } catch (err) {
      uiStore.addToast('Save Failed', 'alert', getHumanReadableError(err));
      return;
    }
    editorStore.closeTab(closingTabId);
    if (isClosingWindow) {
      advanceCloseQueue();
    } else {
      closingTabId = null;
      debouncedSaveFullSession();
    }
  }

  function openGlobalSearch() {
    uiStore.setSidebarOpen(true);
    uiStore.setActiveSidebarPanel('search');
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('#global-search-input');
      el?.focus();
      el?.select();
    }, 50);
  }

  let chordPrefix: string | null = null;
  let chordTimeout: number | null = null;

  function clearChord() {
    chordPrefix = null;
    if (chordTimeout) clearTimeout(chordTimeout);
    chordTimeout = null;
    uiStore.setGlobalStatus(null);
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    const isMac = navigator.userAgent.toLowerCase().includes('mac');
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
    const key = e.key.toLowerCase();

    // ── CHORD LOGIC (e.g. Ctrl+K -> Ctrl+W) ──
    if (chordPrefix === 'Ctrl+K') {
      e.preventDefault();
      e.stopPropagation();
      if ((cmdOrCtrl && key === 'w') || key === 'w') {
        // Ctrl+K+W: close all tabs in the active pane, then close the pane
        const splitSnap = splitStore.getSnapshot();
        const activePaneId = splitSnap.activePaneId;
        if (activePaneId) {
          const pane = splitSnap.panes[activePaneId];
          if (pane) {
            pane.tabs.forEach((t: any) => {
              editorStore.closeTab(t.id);
            });
            splitStore.closeAllTabsInPane(activePaneId);
            // Close pane if more than one exists
            const allPaneIds = splitStore.collectPaneIds();
            if (allPaneIds.length > 1) {
              splitStore.closePane(activePaneId);
            }
          }
        }
      } else if ((cmdOrCtrl && key === 'o') || key === 'o') {
        import('@tauri-apps/plugin-dialog').then(({ open }) => {
          open({ directory: true }).then((selected) => {
            if (selected) {
              const path = Array.isArray(selected) ? selected[0] : selected;
              window.dispatchEvent(new CustomEvent('request-workspace-switch', { detail: { path } }));
            }
          });
        });
      }
      clearChord();
      return;
    }

    if (cmdOrCtrl && key === 'k' && !e.shiftKey) {
      e.preventDefault();
      chordPrefix = 'Ctrl+K';
      uiStore.setGlobalStatus("Ctrl+K was pressed. Waiting for second key of chord...");
      chordTimeout = setTimeout(() => {
        clearChord();
      }, 3000) as unknown as number;
      return;
    }

    // Close Tab (Ctrl+W / Ctrl+F4) — split-pane-aware
    if ((cmdOrCtrl && key === 'w') || e.key === 'F4') {
      if (cmdOrCtrl && !e.shiftKey) {
        e.preventDefault();
        const splitSnap = splitStore.getSnapshot();
        const activePaneId = splitSnap.activePaneId;
        const activePaneObj = splitSnap.panes[activePaneId];
        if (activePaneObj && activePaneObj.activeTabId) {
          const tabId = activePaneObj.activeTabId;
          handleTabClose(tabId);
          // After close, if pane has no tabs and > 1 pane exists → close pane
          const snapAfter = splitStore.getSnapshot();
          const paneAfter = snapAfter.panes[activePaneId];
          if (paneAfter && paneAfter.tabs.length === 0 && splitStore.collectPaneIds().length > 1) {
            splitStore.closePane(activePaneId);
          }
        } else if (activePaneId && splitStore.collectPaneIds().length > 1) {
          // No tabs in pane → close the pane
          splitStore.closePane(activePaneId);
        }
      }
    }

    // ── BLOKIR FITUR BAWAAN BROWSER ──
    // 1. Find / Search / Sidebar panels
    if ((cmdOrCtrl && (key === 'f' || key === 'g' || key === 'e')) || e.key === 'F3') {
      if (!e.shiftKey) e.preventDefault();
      // Ctrl+F opens the per-file find widget via the editor keymap; F3 /
      // Ctrl+G remain blocked. Ctrl+Shift+F opens the global search panel.
    }
    if (cmdOrCtrl && e.shiftKey && key === 'f') {
      e.preventDefault();
      openGlobalSearch();
    }
    if (cmdOrCtrl && e.shiftKey && key === 'e') {
      e.preventDefault();
      uiStore.setSidebarOpen(true);
      uiStore.setActiveSidebarPanel('explorer');
    }
    if (cmdOrCtrl && e.shiftKey && key === 'g') {
      e.preventDefault();
      uiStore.setSidebarOpen(true);
      uiStore.setActiveSidebarPanel('git');
    }
    // 2. Print & Save
    if (cmdOrCtrl && key === 'p') {
      e.preventDefault();
      if (e.shiftKey) {
        openCommandPalette('>');
      } else {
        openCommandPalette('');
      }
    }
    if (cmdOrCtrl && !e.shiftKey && key === 's') {
      e.preventDefault(); 
      window.dispatchEvent(new CustomEvent('editor:save'));
    }
    if (cmdOrCtrl && e.shiftKey && key === 's') {
      e.preventDefault(); 
      window.dispatchEvent(new CustomEvent('editor:save-as'));
    }
    // 3. DevTools & View Source (Unblocked for debugging)
    // if (e.key === 'F12' || 
    //    (cmdOrCtrl && e.shiftKey && (key === 'i' || key === 'j')) || 
    //    (cmdOrCtrl && key === 'u')) {
    //   e.preventDefault();
    // }
    // 4. Refresh / Reload + Run
    // F5 family is repurposed VS Code-style: run configuration, run current
    // file, stop. Ctrl/Cmd+R variants stay blocked (no accidental reload).
    if (e.key === 'F5' || (cmdOrCtrl && key === 'r') || (cmdOrCtrl && e.shiftKey && key === 'r')) {
      e.preventDefault();
      if (e.key === 'F5') {
        import('./lib/services/runService').then(m => {
          if (e.shiftKey) m.stopActiveRuns();
          else if (cmdOrCtrl) m.runCurrentFile();
          else m.runSelectedConfiguration();
        });
      }
    }
    // 5. Zooming Browser
    if (cmdOrCtrl && (key === '+' || key === '=' || key === '-' || key === '0')) {
      e.preventDefault();
    }
    // 6. Navigation History
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      if (e.key === 'ArrowLeft') navigationStore.navigateBack();
      else navigationStore.navigateForward();
    }
    // 7. Reopen Closed Tab
    if (cmdOrCtrl && e.shiftKey && key === 't') {
      e.preventDefault();
      editorStore.reopenClosedTab();
    }

    // ── NOTRON CUSTOM SHORTCUTS ──
    if (cmdOrCtrl && key === 'n') {
      e.preventDefault(); baseCommands[0].action();
    }
    if (cmdOrCtrl && key === 'b') {
      e.preventDefault(); uiStore.toggleSidebar();
    }
    if (cmdOrCtrl && e.shiftKey && key === 'd') {
      e.preventDefault();
      uiStore.setSidebarOpen(true);
      uiStore.setActiveSidebarPanel('run');
    }
    if (cmdOrCtrl && key === 'd') {
      e.preventDefault();
      // Per-file find widget (VS Code "Ctrl+D" habit). The editor ignores the
      // event when no tab is open.
      window.dispatchEvent(new CustomEvent('editor:action', { detail: { action: 'find' } }));
    }
    if (cmdOrCtrl && key === 'h') {
      e.preventDefault();
      // Per-file replace widget (VS Code "Ctrl+H"): opens with the replace row
      // expanded and focused.
      window.dispatchEvent(new CustomEvent('editor:action', { detail: { action: 'replace' } }));
    }
    if (cmdOrCtrl && key === ',') {
      e.preventDefault(); openSettings();
    }
    if (cmdOrCtrl && key === 'g') {
      e.preventDefault(); isGoToLineOpen = true;
    }
  }

  let lastLoadedRoot: string | null = null;

  onMount(() => {
    // Tahap 0: Theme already loaded from localStorage sync
    // Initialize UI from sync storage (localStorage for fast access)
    uiStore.initFromStorage();
    terminalStore.initFromStorage();
    gitRepoStore.init();

    // Start staged startup
    lastLoadedRoot = uiStore.getSnapshot().explorerRoot;
    stagedStartup().catch(console.error);
  });

  $effect(() => {
    const root = $ui.explorerRoot;
    if (appReady && root && root !== lastLoadedRoot) {
      lastLoadedRoot = root;
      gitRepoStore.setWorkspace(root);
      loadWorkspaceState(root).catch(console.error);
    }
  });

  // Unified file watcher — the Rust backend owns watching (debounce 0.4,
  // coalescing, shared ignore rules 5.2) and fans out ONE `fs-change` event
  // per quiet window (5.1). The frontend only reacts:
  //   - FileTree.svelte   → Explorer cache/tree refresh
  //   - Here             → open-tab state (deleted / reload / renamed)
  interface FsChangeItem {
    type: 'created' | 'deleted' | 'renamed' | 'modified';
    path: string;
    parentPath?: string;
    oldPath?: string;
    newPath?: string;
  }

  $effect(() => {
    const explorerRoot = $ui.explorerRoot;
    if (!explorerRoot || !appReady) return;

    let unsubTabs = editorStore.tabs.subscribe(debouncedSaveFullSession);
    let unsubActive = editorStore.activeTabId.subscribe(debouncedSaveFullSession);
    let unsubSourceControl = sourceControlStore.subscribe(debouncedSaveFullSession);

    let watchStarted = false;
    let unlistenFs: (() => void) | null = null;
    let watchTimer: number | undefined;

    watchTimer = setTimeout(async () => {
      // Delegate watching to the Rust unified service (5.1).
      try {
        await invoke('start_fs_watch', { root: explorerRoot });
        watchStarted = true;
      } catch (e) { console.error("Failed to start Rust file watcher:", e); }

      // D.2/D.7 — populate Git decorations for the Explorer immediately on
      // workspace open (the backend emits `git-decorations-changed`).
      try {
        await invoke('get_repo_state', { cwd: explorerRoot });
      } catch (e) { /* not a repo, git unavailable, etc. */ }

      unlistenFs = await listen('fs-change', async (event) => {
        const payload = (event.payload ?? {}) as { changes: FsChangeItem[] };
        const changes = payload.changes ?? [];
        if (changes.length === 0) return;

        const changedPaths = new Set<string>();
        const removedDecoPaths: string[] = [];

        for (const change of changes) {
          if (change.type === 'renamed') {
            if (change.oldPath && change.newPath) {
              editorStore.updateTabPath(change.oldPath, change.newPath);
              changedPaths.add(change.newPath);
              // Optimistically drop the stale decoration for the old path (D.7);
              // the backend's git-status-refresh will recompute the delta.
              removedDecoPaths.push(change.oldPath);
            }
          } else {
            if (change.path) changedPaths.add(change.path);
            if (change.type === 'deleted') {
              // Close the deleted file's tabs (or mark them 'deleted' when the
              // buffer has unsaved changes) in EVERY store — the tab bar and
              // editor render from splitStore, so editorStore-only cleanup left
              // zombie tabs before.
              editorStore.closeTabsOfDeletedPath(change.path);
              removedDecoPaths.push(change.path);
            }
          }
        }

        if (removedDecoPaths.length > 0) {
          gitDecorationStore.removePaths(removedDecoPaths);
        }

        if (changedPaths.size === 0) return;

        // Reload open tabs affected by create/modify events — batched into
        // 2 IPC calls (get_files_metadata + batch_read_files) instead of N×2
        // per tab.
        const affectedTabs = editorStore.getTabsSnapshot().filter((tab: any) => {
          if (!tab.path || tab.path.startsWith('Untitled')) return false;
          return changedPaths.has(tab.path) && tab.content !== null;
        });

        if (affectedTabs.length === 0) return;

        const affectedPaths = affectedTabs.map((t: any) => t.path);
        const metadata = await invoke<any[]>('get_files_metadata', { paths: affectedPaths }).catch(() => []);
        const existing = new Set<string>(metadata.map((m: any) => m.path));
        const sizeByPath = new Map<string, number>(metadata.map((m: any) => [m.path, m.size]));

        // Close deleted tabs (both stores — dirty buffers stay open, marked deleted)
        for (const tab of affectedTabs) {
          if (!existing.has(tab.path)) editorStore.closeTabsOfDeletedPath(tab.path);
        }

        // Reload small files in one batch (large files via chunked reads)
        const smallTabs = affectedTabs.filter((t: any) => existing.has(t.path) && (sizeByPath.get(t.path) ?? 0) <= LARGE_FILE_THRESHOLD_BYTES);
        const largeTabs = affectedTabs.filter((t: any) => existing.has(t.path) && (sizeByPath.get(t.path) ?? 0) > LARGE_FILE_THRESHOLD_BYTES);

        if (smallTabs.length > 0) {
          const contents = await invoke<Record<string, string | null>>('batch_read_files', {
            paths: smallTabs.map((t: any) => t.path)
          }).catch(() => ({} as Record<string, string | null>));

          for (const tab of smallTabs) {
            const content = contents[tab.path];
            if (content === null || content === undefined) continue; // binary / unreadable
            const latestTab = editorStore.getTabsSnapshot().find((t: any) => t.id === tab.id);
            if (!latestTab) continue;
            if (!latestTab.isModified && content !== latestTab.content) {
              editorStore.setInitialContent(tab.id, content);
              const synced = editorStore.getTabsSnapshot().find((t: any) => t.id === tab.id);
              if (synced) splitStore.updateTabInAllPanes(synced);
            } else if (latestTab.isModified && content !== latestTab.originalContent) {
              editorStore.markTabConflict(tab.id);
              console.warn(`External change detected for ${tab.path} while modified in editor`);
            }
          }
        }

        for (const tab of largeTabs) {
          try {
            const chunked = await invoke<any>('read_file_chunked', { path: tab.path });
            const latestTab = editorStore.getTabsSnapshot().find((t: any) => t.id === tab.id);
            if (latestTab && !latestTab.isModified && chunked.content !== latestTab.content) {
              editorStore.setInitialContent(tab.id, chunked.content);
              editorStore.updateTab(tab.id, { isLargeFile: true, isPreview: true });
              const synced = editorStore.getTabsSnapshot().find((t: any) => t.id === tab.id);
              if (synced) splitStore.updateTabInAllPanes(synced);
            }
          } catch (e) { /* file may have been removed mid-read */ }
        }
      });
    }, 1500);

    // Save session on beforeunload
    const handleBeforeUnload = () => {
      saveWorkspaceSession();
      // Save critical config for next startup skeleton
      const uiVal = uiStore.getSnapshot();
      const termVal = terminalStore.getSnapshot();
      invoke('save_critical_config', {
        config: {
          theme: $themeStore.theme || 'system',
          window_width: window.innerWidth,
          window_height: window.innerHeight,
          window_x: null,
          window_y: null,
          window_maximized: true,
          sidebar_width: uiVal.sidebarWidth,
          sidebar_visible: uiVal.isSidebarOpen,
          terminal_visible: termVal.isVisible,
          terminal_height: termVal.height,
          active_workspace: uiVal.explorerRoot || null,
        }
      }).catch(() => {});

      // Clear crash flag on normal close
      invoke('set_crash_flag', { value: false }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearTimeout(watchTimer);
      if (unlistenFs) unlistenFs();
      if (watchStarted) invoke('stop_fs_watch', { root: explorerRoot }).catch(() => {});
      unsubTabs();
      unsubActive();
      unsubSourceControl();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  });

  // Auto-save is handled inside editorStore.scheduleAutoSave (triggered by
  // updateContent), which honors the auto_save setting and auto_save_delay_ms.
  // Keeping it in one place avoids double-saving and makes the unsaved dot
  // clear at the configured delay.

  // Memory management: enforce tab suspension periodically (Bagian 8.2)
  $effect(() => {
    const interval = setInterval(() => {
      editorStore.enforceMemoryLimit();
    }, 30000);
    return () => clearInterval(interval);
  });

  // Debounced save for cursor/scroll changes
  const cursorSignal = editorStore.cursorSignal;
  $effect(() => {
    $cursorSignal;
    if (!activeTab) return;
    debouncedSaveCursorScroll();
  });

  // Debounced save for expanded paths
  const expandedPathsStore = uiStore.expandedPaths;
  $effect(() => {
    const paths = $expandedPathsStore;
    if (paths.size > 0) debouncedSaveExpanded();
  });

  // Global event listeners
  function handleGlobalMouseUp(e: MouseEvent) {
    if (e.button === 3) { // Mouse Back
      e.preventDefault();
      navigationStore.navigateBack();
    } else if (e.button === 4) { // Mouse Forward
      e.preventDefault();
      navigationStore.navigateForward();
    }
  }

  $effect(() => {
    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    const preventCM = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('contextmenu', preventCM);
    const openCmd = () => openCommandPalette('>');
    window.addEventListener('open-command-palette', openCmd);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeydown);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('contextmenu', preventCM);
      window.removeEventListener('open-command-palette', openCmd);
    };
  });
</script>

<div class="h-screen w-screen flex flex-col overflow-hidden bg-canvas text-primary"
  class:dark={isDark}
>


  <div class="h-9 flex items-center justify-between pl-2 select-none bg-surface-2 text-primary border-b border-subtle" data-tauri-drag-region>
    <div class="flex items-center h-full" data-tauri-drag-region="false">
      <img src="/notron.png" alt="Notron Logo" class="w-4 h-4 ml-1 pointer-events-none" />
      <TitleMenuBar />
    </div>
    
    <div class="flex-1 h-full pointer-events-none"></div>

    <div class="h-full flex items-center justify-center" data-tauri-drag-region="false">
      <div class="flex items-center gap-1">
        <button 
          class="p-1 rounded transition-colors hover:bg-hover text-icon-default hover:text-icon-active disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={() => navigationStore.navigateBack()}
          title="Go Back (Alt+LeftArrow)"
          disabled={!$canGoBack}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <button 
          class="p-1 rounded transition-colors hover:bg-hover text-icon-default hover:text-icon-active disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={() => navigationStore.navigateForward()}
          title="Go Forward (Alt+RightArrow)"
          disabled={!$canGoForward}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>

        <button 
          class="flex items-center justify-center w-72 h-6 px-3 mx-2 rounded-md border border-subtle bg-surface hover:bg-hover transition-colors text-xs text-secondary hover:text-primary cursor-pointer shadow-elevated-sm"
          onclick={() => openCommandPalette('')}
          title="Search files (Ctrl+P)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2 opacity-70"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <span class="truncate">{$ui.explorerRoot ? $ui.explorerRoot.split(/[/\\]/).pop() : 'Notron'}</span>
        </button>
      </div>
    </div>
    
    <div class="flex-1 h-full pointer-events-none"></div>

    <div class="flex items-center justify-end h-full" data-tauri-drag-region="false">
      <button
        aria-label="Minimize"
        onclick={() => getCurrentWindow().minimize()}
        class="w-[46px] h-full flex items-center justify-center text-icon-default hover:bg-hover hover:text-icon-active transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        onclick={() => getCurrentWindow().toggleMaximize()}
        class="w-[46px] h-full flex items-center justify-center text-icon-default hover:bg-hover hover:text-icon-active transition-colors"
      >
        {#if isMaximized}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
        {/if}
      </button>
      <button
        aria-label="Close"
        onclick={() => getCurrentWindow().close()}
        class="w-[46px] h-full flex items-center justify-center text-icon-default hover:bg-[var(--color-error)] hover:text-[var(--text-inverse)] transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  </div>

  {#if !appReady}
    <div class="flex flex-1 overflow-hidden">
      <!-- Activity Bar Skeleton -->
      <div class="w-12 shrink-0 border-r border-subtle bg-surface-2"></div>

      <!-- Sidebar Skeleton -->
      {#if $ui.isSidebarOpen}
        <div class="shrink-0 border-r border-subtle bg-surface" style="width: {$ui.sidebarWidth}px"></div>
      {/if}

      <!-- Main Editor Area & Terminal Skeleton -->
      <div class="flex flex-1 flex-col overflow-hidden bg-canvas">
        <!-- Editor Tabs Header Skeleton -->
        <div class="h-9 shrink-0 border-b border-subtle bg-surface-2"></div>
        
        <!-- Editor Body Skeleton -->
        <div class="flex-1 bg-canvas"></div>

        <!-- Terminal Panel Skeleton -->
        {#if $terminalStore.isVisible}
          <div class="shrink-0 border-t border-subtle bg-surface-2" style="height: {$terminalStore.isMaximized ? 'calc(100vh - 2.25rem)' : `${$terminalStore.height}px`};"></div>
        {/if}
      </div>
    </div>
  {:else}
  <div class="flex flex-1 overflow-hidden">
    <div class="w-12 flex flex-col items-center py-0 justify-between z-10 border-r border-subtle bg-surface-2">
      <div class="flex flex-col items-center gap-1 w-full mt-2">
        <Tooltip content="Explorer (Ctrl+Shift+E)" side="right" hoverDelay={300}>
          <button aria-label="Explorer" onclick={() => { if ($ui.isSidebarOpen && $ui.activeSidebarPanel === 'explorer') uiStore.setSidebarOpen(false); else { uiStore.setActiveSidebarPanel('explorer'); uiStore.setSidebarOpen(true); } }} class="p-2 mb-2 bg-transparent cursor-pointer relative transition-colors hover:text-icon-active"
            class:text-icon-active-tab={$ui.activeSidebarPanel === 'explorer' && $ui.isSidebarOpen}
            class:text-icon-default={!($ui.activeSidebarPanel === 'explorer' && $ui.isSidebarOpen)}
          >
            {#if $ui.activeSidebarPanel === 'explorer' && $ui.isSidebarOpen}
              <div class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-indicator-active"></div>
            {/if}
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </button>
        </Tooltip>
        <Tooltip content="Search (Ctrl+Shift+F)" side="right" hoverDelay={300}>
          <button aria-label="Search" onclick={() => { if ($ui.isSidebarOpen && $ui.activeSidebarPanel === 'search') uiStore.setSidebarOpen(false); else { uiStore.setActiveSidebarPanel('search'); uiStore.setSidebarOpen(true); } }} class="p-2 mb-2 bg-transparent cursor-pointer relative transition-colors hover:text-icon-active"
            class:text-icon-active-tab={$ui.activeSidebarPanel === 'search' && $ui.isSidebarOpen}
            class:text-icon-default={!($ui.activeSidebarPanel === 'search' && $ui.isSidebarOpen)}
          >
            {#if $ui.activeSidebarPanel === 'search' && $ui.isSidebarOpen}
              <div class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-indicator-active"></div>
            {/if}
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </Tooltip>
        <Tooltip content="Source Control (Ctrl+Shift+G)" side="right" hoverDelay={300}>
          <button aria-label="Source Control" onclick={() => { if ($ui.isSidebarOpen && $ui.activeSidebarPanel === 'git') uiStore.setSidebarOpen(false); else { uiStore.setActiveSidebarPanel('git'); uiStore.setSidebarOpen(true); } }} class="p-2 mb-2 bg-transparent cursor-pointer relative transition-colors hover:text-icon-active"
            class:text-icon-active-tab={$ui.activeSidebarPanel === 'git' && $ui.isSidebarOpen}
            class:text-icon-default={!($ui.activeSidebarPanel === 'git' && $ui.isSidebarOpen)}
          >
            {#if $ui.activeSidebarPanel === 'git' && $ui.isSidebarOpen}
              <div class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-indicator-active"></div>
            {/if}
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M6 9v6"/><path d="M18 9v2a2 2 0 0 1-2 2h-4a2 2 0 0 0-2 2v6"/></svg>
            
            {#if gitLoading && $ui.activeSidebarPanel === 'git' && $ui.isSidebarOpen}
              <div class="absolute bottom-0 -right-1 bg-accent text-on-accent rounded-full h-4 min-w-4 flex items-center justify-center border-2 border-surface-2 shadow-elevated-sm pointer-events-none" title="Git is analyzing...">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="animate-spin"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
              </div>
            {:else if gitChangesCount > 0}
              <div class="absolute bottom-0 -right-1 bg-accent text-on-accent text-[9px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center border-2 border-surface-2 shadow-elevated-sm pointer-events-none">
                {gitChangesCount > 99 ? '99+' : gitChangesCount}
              </div>
            {/if}
          </button>
        </Tooltip>
        <Tooltip content="Run (Ctrl+Shift+D)" side="right" hoverDelay={300}>
          <button aria-label="Run" onclick={() => { if ($ui.isSidebarOpen && $ui.activeSidebarPanel === 'run') uiStore.setSidebarOpen(false); else { uiStore.setActiveSidebarPanel('run'); uiStore.setSidebarOpen(true); } }} class="p-2 mb-2 bg-transparent cursor-pointer relative transition-colors hover:text-icon-active"
            class:text-icon-active-tab={$ui.activeSidebarPanel === 'run' && $ui.isSidebarOpen}
            class:text-icon-default={!($ui.activeSidebarPanel === 'run' && $ui.isSidebarOpen)}
          >
            {#if $ui.activeSidebarPanel === 'run' && $ui.isSidebarOpen}
              <div class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-indicator-active"></div>
            {/if}
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 18 12 6 21 6 3"/></svg>
          </button>
        </Tooltip>
      </div>
      <Tooltip content="Settings (Ctrl+,)" side="right" hoverDelay={300}>
        <button aria-label="Settings" onclick={openSettings} class="p-2 bg-transparent cursor-pointer mb-2 text-icon-default hover:text-icon-active transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </Tooltip>
    </div>

    {#if $ui.isSidebarOpen}
      <div style="width: {$ui.sidebarWidth}px" class="flex flex-col border-r z-50 relative shrink-0 border-subtle bg-surface">
        <div
          role="presentation"
          class="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-[var(--accent)] active:bg-[var(--accent-active)] z-50 transition-colors delay-100"
          onmousedown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = $ui.sidebarWidth;
            function handleMouseMove(me: MouseEvent) { setSidebarWidth(Math.max(160, Math.min(startWidth + (me.clientX - startX), 600))); }
            function handleMouseUp(_me: MouseEvent) {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
              // Save sidebar width immediately on drag end (Bagian 3.3)
              saveWorkspaceSession();
            }
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        ></div>
        <div class="h-9 flex items-center justify-between px-4 text-xs font-semibold tracking-widest select-none uppercase text-secondary">
          <span>{$ui.activeSidebarPanel === 'explorer' ? 'Explorer' : $ui.activeSidebarPanel === 'search' ? 'Search' : $ui.activeSidebarPanel === 'git' ? 'Source Control' : 'Run'}</span>
          {#if $ui.activeSidebarPanel === 'explorer'}
            <Tooltip content="Toggle VCS/System Hidden Files (.git, .svn, …)">
              <button aria-label="Toggle Hidden VCS Files" onclick={() => uiStore.toggleShowDotFiles()} class="p-1 rounded transition-colors hover:bg-hover" class:text-accent={$ui.showDotFiles} class:text-icon-default={!$ui.showDotFiles} class:hover:text-icon-active={true}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
              </button>
            </Tooltip>
          {:else if $ui.activeSidebarPanel === 'search'}
            {@const canSearchAction = $ui.searchQuery.length > 0 && $ui.searchResultCount > 0}
            <div class="flex items-center gap-0.5">
              <Tooltip content="Refresh">
                <button aria-label="Refresh" onclick={() => uiStore.triggerSearchRefresh()} class="p-1 rounded transition-colors hover:bg-hover text-icon-default" disabled={!canSearchAction} class:opacity-50={!canSearchAction} class:cursor-not-allowed={!canSearchAction} class:hover:text-icon-active={canSearchAction}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                </button>
              </Tooltip>
              <Tooltip content="Collapse All">
                <button aria-label="Collapse All" onclick={() => uiStore.triggerSearchCollapseAll()} class="p-1 rounded transition-colors hover:bg-hover text-icon-default" disabled={!canSearchAction} class:opacity-50={!canSearchAction} class:cursor-not-allowed={!canSearchAction} class:hover:text-icon-active={canSearchAction}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                </button>
              </Tooltip>
            </div>
          {/if}
        </div>
        <div class="flex-1 overflow-y-auto text-sm hover-scrollbar">
          {#if $ui.activeSidebarPanel === 'explorer'}
            <div class="flex flex-col h-full">
              {#if $ui.explorerRoot}
                <div class="flex flex-col h-full">
                  <div class="group h-7 flex items-center justify-between px-4 border-b border-subtle shrink-0 bg-surface">
                    <span class="text-[11px] font-semibold uppercase truncate pr-2 text-primary">
                      {$ui.explorerRoot.split(/[/\\]/).pop() || 'WORKSPACE'}
                    </span>
                    <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Tooltip content="New File">
                        <button aria-label="New File" onclick={(e) => { e.preventDefault(); e.stopPropagation(); document.dispatchEvent(new CustomEvent('notron-create-file')); }} class="p-1 rounded transition-colors hover:bg-hover text-icon-default hover:text-icon-active">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                        </button>
                      </Tooltip>
                      <Tooltip content="New Folder">
                        <button aria-label="New Folder" onclick={(e) => { e.preventDefault(); e.stopPropagation(); document.dispatchEvent(new CustomEvent('notron-create-folder')); }} class="p-1 rounded transition-colors hover:bg-hover text-icon-default hover:text-icon-active">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
                        </button>
                      </Tooltip>
                      <Tooltip content="Refresh Explorer">
                        <button aria-label="Refresh Explorer" onclick={() => uiStore.triggerExplorerRefresh()} class="p-1 rounded transition-colors hover:bg-hover text-icon-default hover:text-icon-active">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </button>
                      </Tooltip>
                      <Tooltip content="Collapse Explorer">
                        <button aria-label="Collapse Explorer" onclick={() => uiStore.triggerExplorerCollapse()} class="p-1 rounded transition-colors hover:bg-hover text-icon-default hover:text-icon-active">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                  <div class="flex-1 flex flex-col overflow-hidden outline-none">
                    <FileTree rootPath={$ui.explorerRoot} />
                  </div>
                </div>
              {:else}
                <div class="p-4 flex flex-col gap-3">
                  <span class="text-xs text-muted">You have not yet opened a folder.</span>
                  <div class="flex flex-col gap-2">
                    <button onclick={handleOpenFolder} class="text-xs py-1.5 px-3 rounded text-center w-full cursor-pointer transition-colors bg-accent hover:bg-accent-hover text-on-accent">Open Folder</button>
                    <button onclick={handleOpenFile} class="text-xs py-1.5 px-3 rounded text-center w-full cursor-pointer transition-colors bg-surface-2 hover:bg-hover text-primary">Open File</button>
                  </div>
                </div>
              {/if}
            </div>
          {:else if $ui.activeSidebarPanel === 'search' && SearchPanelComponent}
            <div class="flex flex-col h-full overflow-hidden">
              <SearchPanelComponent />
            </div>
          {:else if $ui.activeSidebarPanel === 'git' && SourceControlPanelComponent}
            <div class="flex flex-col h-full overflow-hidden">
              <SourceControlPanelComponent />
            </div>
          {:else if $ui.activeSidebarPanel === 'run' && RunPanelComponent}
            <div class="flex flex-col h-full overflow-hidden">
              <RunPanelComponent />
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Split Editor Layout + Terminal -->
    <div class="flex flex-1 flex-col overflow-hidden bg-canvas">
      <!-- SplitView hides when terminal is maximized -->
      <div class="flex flex-1 overflow-hidden" class:hidden={$terminalStore.isMaximized}>
        <SplitView
          node={$splitStore.rootNode}
          {EditorComponent}
          {DiffEditorComponent}
          {MarkdownPreviewComponent}
          {ImageViewerComponent}
          {ImageDiffComponent}
          {SettingsPageComponent}
          WelcomeTabComponent={WelcomeTab}
          onNewTextFile={handleNewTextFile}
          onOpenFile={handleOpenFile}
          onOpenTerminal={handleOpenTerminal}
        />
      </div>
      <BottomPanel />
    </div>
  </div>
  {/if}


  {#if $ui.isStatusBarEnabled}
  <div class="h-6 flex items-center justify-between px-3 text-xs select-none border-t bg-surface-2 text-primary border-subtle">
      <!-- Left side: A=Ready, B=Language, C=GlobalStatus -->
      <div class="flex items-center gap-4 min-w-[200px]">
        {#if $saveStatus}
          <span class="text-muted animate-in fade-in duration-200">{$saveStatus}</span>
        {:else}
          <span class="animate-in fade-in duration-200">Ready</span>
        {/if}
        {#if activeTab && activeTab.languageDetected && activeTab.language !== 'welcome' && activeTab.language !== 'settings' && activeTab.language !== 'image' && activeTab.language !== 'image-diff' && activeTab.language !== 'markdown-preview'}
          <span>{formatLanguageName(activeTab.language)}</span>
        {/if}
        {#if $ui.globalStatus}
          <span class="animate-in fade-in duration-200" title={$ui.globalStatus}>
            {$ui.globalStatus.length > 40 ? $ui.globalStatus.slice(0, 40) + '...' : $ui.globalStatus}
          </span>
        {/if}
      </div>
      <!-- Right side: -A=Encoding, -B=Ln/Col -->
      <div class="flex items-center gap-4">
        {#if activeTab && activeTab.languageDetected && activeTab.language !== 'welcome' && activeTab.language !== 'settings' && activeTab.language !== 'image' && activeTab.language !== 'image-diff' && activeTab.language !== 'markdown-preview'}
          {#if currentCursorPos}
            <span>{currentCursorPos}</span>
          {/if}
          <span>{activeTab.encoding || 'UTF-8'}</span>
        {/if}
      </div>
  </div>
  {/if}
</div>

{#if CommandPaletteComponent && isCommandPaletteOpen}
  <CommandPaletteComponent isOpen={true} onClose={() => isCommandPaletteOpen = false} initialQuery={commandPaletteInitialQuery} />
{/if}

{#if SettingsPageComponent && isSettingsOpen}
  <SettingsPageComponent isOpen={true} onClose={() => isSettingsOpen = false} />
{/if}

{#if GoToLineComponent && isGoToLineOpen}
  <GoToLineComponent isOpen={true} onClose={() => isGoToLineOpen = false} onGoToLine={(line: number) => {
    if (activeTab) {
      navigationStore.recordNavigation(activeTab.path, line, 1);
    }
    window.dispatchEvent(new CustomEvent('editor:action', { detail: { action: 'goto', line } }));
  }} />
{/if}

<CloseTabDialog
  isOpen={!!closingTabId}
  fileName={$tabs.find((t: any) => t.id === closingTabId)?.name || 'Untitled'}
  onCancel={handleCloseDialogCancel}
  onDontSave={handleCloseDialogDontSave}
  onSave={handleCloseSave}
/>

<NewFileDialog 
  isOpen={$ui.isNewFileDialogOpen}
  isFromWelcome={$ui.newFileDialogSource === 'welcome'}
  onClose={() => uiStore.closeNewFileDialog()} 
/>

<TrustModal />
<RecentFoldersModal />

<ToastContainer />

<style>
  :global(.scrollbar-hide::-webkit-scrollbar) { display: none; }
  :global(.scrollbar-hide) { -ms-overflow-style: none; scrollbar-width: none; }
</style>