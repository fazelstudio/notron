
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { open, save } from '@tauri-apps/plugin-dialog';
  import { startupIpc, systemIpc } from './lib/platform/ipc';
  import { listen } from '@tauri-apps/api/event';
  import { editorStore } from './lib/stores/editor';
  import { uiStore } from './lib/stores/ui';
  import { getHumanReadableError } from './lib/utils/error';
  import { settingsStore } from './lib/stores/settings.svelte';
  import { themeStore } from './lib/stores/theme';
  import TitleBar from './lib/components/shell/TitleBar.svelte';
  import ActivityBar from './lib/components/shell/ActivityBar.svelte';
  import Sidebar from './lib/components/shell/Sidebar.svelte';
  import StatusBar from './lib/components/shell/StatusBar.svelte';
  // Ensure workbench contributions are registered before shell renders
  import './lib/workbench/contributions';
  import './lib/workbench/statusBarContributions';
  import './lib/workbench/previewRegistry';
  import './lib/contrib';
  import './lib/services/notificationService';
  import './lib/commands/tabCommands';
  import './lib/commands/viewCommands';
  import './lib/commands/fileCommands';
  import './lib/commands/terminalCommands';
  import './lib/commands/gitCommands';
  import './lib/commands/windowCommands';
  import './lib/commands/runCommands';
  import './lib/commands/editorActionCommands';
  import './lib/commands/searchCommands';
  import './lib/theme/commands';
  import './lib/icon-theme/commands';
  import CloseTabDialog from './lib/components/panels/CloseTabDialog.svelte';
  import WelcomeTab from './lib/components/editor/WelcomeTab.svelte';
  import NewFileDialog from './lib/components/panels/NewFileDialog.svelte';
  import TrustModal from './lib/components/panels/TrustModal.svelte';
  import RecentFoldersModal from './lib/components/panels/RecentFoldersModal.svelte';
  import BottomPanel from './lib/components/panels/BottomPanel.svelte';
  import QuickPickDialog from './lib/components/common/QuickPickDialog.svelte';
  import InputBoxDialog from './lib/components/common/InputBoxDialog.svelte';
  // Registers the shared dialog capabilities and their command entry point.
  import './lib/services/dialogService';
  import ToastContainer from './lib/components/common/ToastContainer.svelte';

  import SplitView from './lib/components/editor/SplitView.svelte';
  import { terminalStore } from './lib/stores/terminal';
  import { paletteStore, type PaletteItem } from './lib/stores/palette';
  import { navigationStore } from './lib/stores/navigation';
  import { gitDecorationStore } from './lib/stores/gitDecoration';
  import { gitRepoStore } from './lib/stores/gitRepo';
  import { sourceControlStore } from './lib/stores/sourceControl';
  import { splitStore } from './lib/stores/split';
  import {
    UNTITLED_PREFIX,
    LARGE_FILE_THRESHOLD_BYTES,
  } from './lib/constants';
  import { handleNewTextFile } from './lib/services/editor/fileOperations';
  import { onMount } from 'svelte';
  import { registerCoreCommands } from './lib/commands/coreCommands';
  import { commandRegistry, toPaletteItems } from './lib/commands/registry';
  // Declares which commands are sensitive (trust-boundary metadata).
  import './lib/commands/commandCapabilities';
  import { createGlobalKeybindingHandlers } from './lib/platform/keybindingService';
  import { eventBus } from './lib/utils/eventBus';
  import {
    saveWorkspaceSession,
    debouncedSaveCursorScroll,
    debouncedSaveExpanded,
    debouncedSaveFullSession,
    recordStartupPhase,
    applySessionState,
    loadActiveTabContent,
  } from './lib/services/workspace/sessionService';

  const tabs = editorStore.tabs;
  const activeTabId = editorStore.activeTabId;
  const ui = uiStore;

  let closingTabId = $state<string | null>(null);
  let isClosingWindow = $state(false);
  let closeQueue = $state<string[]>([]);
  let pendingCloseConfirmed = $state(false);
  let isCommandPaletteOpen = $state(false);
  let commandPaletteInitialQuery = $state('');
  let isSettingsOpen = $state(false);
  let isGoToLineOpen = $state(false);
  let appReady = $state(false);

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
          systemIpc.setCrashFlag(false).catch(() => {});
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

  // Lazy load components only when needed.
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
    const unsubSwitch = eventBus.on('request-workspace-switch', async ({ path }) => {
      if (path) {
        await saveWorkspaceSession();
        navigationStore.reset();
        uiStore.setExplorerRoot(path);
      }
    });
    
    // Split pane / file operations — via typed eventBus (modular)
    const unsubOpen = eventBus.on('request-open-file', async ({ path, line, column, endColumn }) => {
      if (path) {
        await commandRegistry.execute('workbench.action.files.openFileAtPath', path);
        if (line) {
          dispatchGotoWithRetry(line, column, endColumn);
        }
      }
    });
    const unsubOpenSplit = eventBus.on('request-open-file-split', async ({ path }) => {
      if (path) {
        const snap = splitStore.getSnapshot();
        const activeId = snap.activePaneId;
        if (activeId) splitStore.splitPane(activeId, 'right');
        await commandRegistry.execute('workbench.action.files.openFileAtPath', path);
      }
    });
    const unsubCloseTab = eventBus.on('split:request-close-tab', ({ tabId }) => {
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
      unsubSwitch();
      unsubOpen();
      unsubOpenSplit();
      unsubCloseTab();
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



  // Workspace persistence is now handled by the dedicated service.
  // Keeping App.svelte as a thin shell — see src/lib/services/workspace/sessionService.ts
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
          startupIpc.showMainWindow().catch(e => console.error('Failed to show window', e));
        });
      });
    }, 150);

    // Phase 3: Load active tab content + show welcome if no tabs
    await loadActiveTabContent();

    ensureWelcomeTab();

    // Phase 4: Crash Recovery Check (flag is now included in startup state)
    try {
      if (crashFlag) {
        try {
          const dirtySnapshots = await systemIpc.getDirtySnapshots();
          if (dirtySnapshots && dirtySnapshots.length > 0) {
            dirtySnapshots.forEach(snap => {
              // Skip empty snapshots — a prior preview/code race could persist
              // wiped buffers and then clobber the freshly loaded disk content.
              if (typeof snap.content !== 'string' || snap.content.length === 0) return;
              const name = snap.path.split(/[/\\]/).pop() || 'Unknown';
              // Match by path: crash snapshots used path-as-id historically,
              // while session tabs use generated tab-* ids.
              const existingTab =
                editorStore.getTabsSnapshot().find((t: any) => t.id === snap.path || t.path === snap.path);
              if (!existingTab) {
                const id = snap.path;
                editorStore.addTab({
                  id, path: snap.path, name, content: snap.content, language: 'plaintext', languageDetected: false, isPreview: false
                });
                editorStore.updateContent(id, snap.content);
              } else if (!existingTab.content || existingTab.content.length === 0) {
                editorStore.setInitialContent(existingTab.id, snap.content);
                editorStore.updateContent(existingTab.id, snap.content);
              }
            });
            uiStore.addToast('Session restored', 'success', 'after unexpected close');
          } else {
            uiStore.addToast('Session restored', 'success', 'after unexpected close');
          }
        } catch(e) {}
      }
        await systemIpc.setCrashFlag(true);
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

  async function loadWorkspaceState(root: string) {
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
    ensureWelcomeTab();
  }

  function ensureWelcomeTab() {
    const tabsSnapshot = editorStore.getTabsSnapshot();
    const activeId = editorStore.getActiveTabIdSnapshot();
    if (tabsSnapshot.length > 0 && activeId) return;

    const existingWelcome = tabsSnapshot.find((tab: any) => tab.language === 'welcome');
    const welcome = existingWelcome ?? {
      id: 'welcome',
      path: 'Welcome',
      name: 'Welcome',
      content: 'Welcome to Notron',
      language: 'welcome',
      isPreview: true,
    };

    if (!existingWelcome) editorStore.addTab(welcome);
    editorStore.setActiveTab(welcome.id);

    const paneId = splitStore.getSnapshot().activePaneId;
    if (!paneId) return;
    const pane = splitStore.getSnapshot().panes[paneId];
    if (!pane?.tabs.some((tab: any) => tab.id === welcome.id)) {
      splitStore.addTabToPane(paneId, {
        ...welcome,
        originalContent: welcome.content,
        isModified: false,
        lastAccessed: Date.now(),
        status: 'active',
      } as any);
    } else {
      splitStore.setActivePaneTab(paneId, welcome.id);
    }
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

  function openSettings() {
    isSettingsOpen = true;
  }

  // Window / workspace helpers — only commands feasible with current progress.
  // Keeps the palette grounded in what the app can actually do today.
  function reloadWindow() { window.location.reload(); }
  function closeWindow() { getCurrentWindow().close(); }
  function closeWorkspace() {
    const root = uiStore.getSnapshot().explorerRoot;
    if (!root) {
      uiStore.addToast('No folder open', 'alert');
        return;
    uiStore.setExplorerRoot(null);
    uiStore.addToast('Folder closed', 'success');
    }
  }

 // Core commands are now registered via a dedicated registry part
  // so App.svelte stays as a thin shell. The shell only wires callbacks.
  const baseCommands: PaletteItem[] = registerCoreCommands({
    handleNewTextFile,
    openSettings,
    openGoToLine: () => isGoToLineOpen = true,
    navigateBack: () => navigationStore.navigateBack(),
    navigateForward: () => navigationStore.navigateForward(),
    runSelected: () => import('./lib/services/runService').then((m) => m.runSelectedConfiguration()),
    runCurrentFile: () => import('./lib/services/runService').then((m) => m.runCurrentFile()),
    stopRuns: () => import('./lib/services/runService').then((m) => m.stopActiveRuns()),
    reloadWindow,
    closeWindow,
    closeWorkspace,
    createFile: () => {
      const r = uiStore.getSnapshot().explorerRoot;
      if (r) document.dispatchEvent(new CustomEvent('notron-create-file'));
      else uiStore.addToast('No folder open', 'alert');
    },
    createFolder: () => {
      const r = uiStore.getSnapshot().explorerRoot;
      if (r) document.dispatchEvent(new CustomEvent('notron-create-folder'));
      else uiStore.addToast('No folder open', 'alert');
    },
    refreshExplorer: () => uiStore.triggerExplorerRefresh(),
    collapseExplorer: () => uiStore.triggerExplorerCollapse(),
    toggleSidebar: () => uiStore.toggleSidebar(),
  });

  // Palette file index is built lazily (on first palette open) so startup never
  // blocks on a full workspace walk. An idle prefetch warms it afterwards.
  let paletteLoadedFor = $state<string | null>(null);

  function openFileFromPalette(path: string) {
    void commandRegistry.execute('workbench.action.files.openFileAtPath', path);
  }

  function ensurePaletteLoaded() {
    // Build full palette from all registered commands (dogfooding) + workspace files
    // Normalize all command items to category 'command' so CommandPalette filtering works
    // (commandRegistry stores original category like 'Preferences'/'File' for grouping, but palette uses 'command' vs 'file')
    const rawCommands = toPaletteItems(commandRegistry) as PaletteItem[];
    const allCommands = rawCommands.map(c => ({ ...c, category: 'command' as const }));
    const normalizedBase = baseCommands.map(c => ({ ...c, category: 'command' as const }));
    // Deduplicate by id — baseCommands may overlap with registry
    const seen = new Set<string>();
    const merged: PaletteItem[] = [];
    for (const c of [...allCommands, ...normalizedBase]) { if (!seen.has(c.id)) { seen.add(c.id); merged.push(c as any); } }
    const root = uiStore.getSnapshot().explorerRoot;
    if (root) {
      if (paletteLoadedFor === root) return;
      paletteLoadedFor = root;
      paletteStore.loadWorkspaceFiles(root, merged, openFileFromPalette);
    } else {
      paletteStore.initItems(merged);
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
        await commandRegistry.execute('workbench.action.files.openFileAtPath', selected);
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
    // Must clear both stores — the tab bar reads splitStore; closing only
    // editorStore left "ghost" tabs (notably PRD.md after the dirty-buffer bug).
    editorStore.closeTabEverywhere(closingTabId);
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

 // Modular keybinding handling (registry-driven)
  // All keyboard shortcuts are now declared in src/lib/commands/keybindings.ts
  // and dispatched via src/lib/platform/keybindingService.ts. App.svelte only
  // wires the service — no hardcoded if-chain.
  function handleTabClose(tabId: string) {
    const tab = editorStore.getTabsSnapshot().find((t: any) => t.id === tabId);
    if (!tab) return;
    if (tab.isModified || (tab.path.startsWith(UNTITLED_PREFIX) && tab.content && tab.content.trim() !== '')) {
      closingTabId = tabId;
      } else {
      editorStore.closeTabEverywhere(tabId);
    }
  }

  let lastLoadedRoot: string | null = null;

  onMount(() => {
    // Theme is already applied from localStorage.
    // Initialize UI from local storage for fast access.
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

  // Enforce tab suspension periodically to limit memory.
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

  // Global keybinding & mouse handling — modular via platform service
  // All shortcuts are declarative (commands/keybindings.ts) and dispatched
  // through the command registry. App.svelte only wires the service.
  $effect(() => {
    const handlers = createGlobalKeybindingHandlers({
      openCommandPalette,
      openSettings,
      openGlobalSearch,
      handleTabClose,
      handleNewTextFile,
      getIsGoToLineOpen: () => isGoToLineOpen,
      setIsGoToLineOpen: (v) => (isGoToLineOpen = v),
      getBaseCommands: () => baseCommands
    });
    const detach = handlers.attach();
    return () => detach();
  });

  // Quick Open vs Command Palette distinction (VS Code parity)
  // Ctrl+P / quick-open → file list (initialQuery ''), Ctrl+Shift+P / showCommands → command list (initialQuery '>')
  // viewCommands dispatches 'quick-open' for quickOpen and 'open-command-palette' for showCommands (handled in keybindingService)
  // Here we ensure quick-open is actually wired to file mode
  $effect(() => {
    const handler = () => openCommandPalette('');
    const gotoHandler = () => (isGoToLineOpen = true);
    const settingsHandler = () => openSettings();
    window.addEventListener('quick-open', handler);
    window.addEventListener('open-goto-line', gotoHandler);
    window.addEventListener('open-settings', settingsHandler);
    return () => {
      window.removeEventListener('quick-open', handler);
      window.removeEventListener('open-goto-line', gotoHandler);
      window.removeEventListener('open-settings', settingsHandler);
    };
  });
</script>

<div class="h-screen w-screen flex flex-col overflow-hidden bg-editor text-primary"
  class:dark={isDark}
>


  <TitleBar onQuickOpen={() => commandRegistry.execute('workbench.action.quickOpen')} />

  {#if !appReady}
    <div class="flex flex-1 overflow-hidden">
      <!-- Activity Bar Skeleton -->
      <div class="w-12 shrink-0 border-r border-subtle bg-panel"></div>

      <!-- Sidebar Skeleton -->
      {#if $ui.isSidebarOpen}
        <div class="shrink-0 border-r border-subtle bg-surface" style="width: {$ui.sidebarWidth}px"></div>
      {/if}

      <!-- Main Editor Area & Terminal Skeleton -->
      <div class="flex flex-1 flex-col overflow-hidden bg-editor">
        <!-- Editor Tabs Header Skeleton -->
        <div class="h-9 shrink-0 border-b border-subtle bg-panel"></div>
        
        <!-- Editor Body Skeleton -->
        <div class="flex-1 bg-editor"></div>

        <!-- Terminal Panel Skeleton -->
        {#if $terminalStore.isVisible}
          <div class="shrink-0 border-t border-subtle bg-panel" style="height: {$terminalStore.isMaximized ? 'calc(100vh - 2.25rem)' : `${$terminalStore.height}px`};"></div>
        {/if}
      </div>
    </div>
  {:else}
  <div class="flex flex-1 overflow-hidden">
    <ActivityBar onOpenSettings={openSettings} />

    <Sidebar onOpenFolder={handleOpenFolder} onOpenFile={handleOpenFile} />

    <!-- Split Editor Layout + Terminal -->
    <div class="flex flex-1 flex-col overflow-hidden bg-editor">
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


  <StatusBar />
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
<QuickPickDialog />
<InputBoxDialog />

<ToastContainer />

<style>
  :global(.scrollbar-hide::-webkit-scrollbar) { display: none; }
  :global(.scrollbar-hide) { -ms-overflow-style: none; scrollbar-width: none; }
</style>
