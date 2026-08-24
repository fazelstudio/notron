<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { editorStore } from '../../stores/editor';
  import { splitStore } from '../../stores/split';
  import { terminalStore } from '../../stores/terminal';
  import { settingsStore } from '../../stores/settings.svelte';
  import { getGitFileContent } from '../../services/git';
  import { dirname } from '../../utils/path';
  import { getFileIcon } from '../../utils/fileIcons';
  import MaterialIcon from '../common/MaterialIcon.svelte';
  import SvgViewToggle from '../common/SvgViewToggle.svelte';
  import MarkdownViewToggle from '../common/MarkdownViewToggle.svelte';
  import type { EditorPane } from '../../stores/split';

  interface Props {
    paneId: string;
    onNewTextFile?: () => void;
    onOpenFile?: () => void;
    onOpenTerminal?: () => void;
    EditorComponent?: any;
    DiffEditorComponent?: any;
    MarkdownPreviewComponent?: any;
    ImageViewerComponent?: any;
    ImageDiffComponent?: any;
    SettingsPageComponent?: any;
    WelcomeTabComponent?: any;
  }

  let {
    paneId,
    onNewTextFile,
    onOpenFile,
    onOpenTerminal,
    EditorComponent,
    DiffEditorComponent,
    MarkdownPreviewComponent,
    ImageViewerComponent,
    ImageDiffComponent,
    SettingsPageComponent,
    WelcomeTabComponent,
  }: Props = $props();

  const splitState = splitStore;

  let pane = $derived($splitState.panes[paneId] as EditorPane | undefined);
  let tabs = $derived(pane?.tabs ?? []);
  let activeTabId = $derived(pane?.activeTabId ?? null);
  let activeTab = $derived(tabs.find(t => t.id === activeTabId) ?? null);
  let isActive = $derived($splitState.activePaneId === paneId);
  let totalPanes = $derived(Object.keys($splitState.panes).length);

  // Loading tab IDs guard
  const loadingTabIds = new Set<string>();

  // Lazy-load content when activeTab changes and content is null
  $effect(() => {
    if (
      activeTab &&
      activeTab.content === null &&
      activeTab.path &&
      !activeTab.path.startsWith('Untitled') &&
      !activeTab.isLoading &&
      !loadingTabIds.has(activeTab.id)
    ) {
      const tabId = activeTab.id;
      const path = activeTab.path;
      loadingTabIds.add(tabId);
      editorStore.setTabLoading(tabId, true);

      const syncToSplit = () => {
        const snap = editorStore.getTabsSnapshot();
        const updatedTab = snap.find(t => t.id === tabId);
        if (updatedTab) splitStore.updateTabInAllPanes(updatedTab);
      };

      if (activeTab.isDiff) {
        // Diff tabs restored from a session have no content — refetch both
        // sides: working-tree diffs read from disk, commit diffs from git.
        const dir = dirname(path);
        const currentRev = activeTab.diffCurrentRevision;
        const originalRev = activeTab.diffOriginalRevision;
        Promise.all([
          currentRev && currentRev !== 'working-tree'
            ? getGitFileContent(dir, path, currentRev)
            : invoke<string>('read_file_text', { path }).then(c => c, (err: unknown) => {
                if (String(err) === '__BINARY__') return '__UNSUPPORTED__';
                throw err;
              }),
          originalRev
            ? getGitFileContent(dir, path, originalRev)
            : Promise.resolve(activeTab.diffOriginalContent ?? null),
        ]).then(([current, original]) => {
          const unsupported = current === '__UNSUPPORTED__';
          editorStore.setInitialContent(tabId, unsupported ? '' : (current ?? ''));
          editorStore.updateTab(tabId, {
            diffOriginalContent: original ?? '',
            ...(unsupported ? { isUnsupported: true } : {}),
          });
          syncToSplit();
        }).catch(err => {
          console.error('Failed to lazy load diff tab:', err);
        }).finally(() => {
          editorStore.setTabLoading(tabId, false);
          loadingTabIds.delete(tabId);
        });
      } else if (activeTab.isLargeFile) {
        // Large files: restore only the preview chunk instead of the full
        // document, so a session-restored large tab rehydrates cheaply.
        invoke<any>('read_file_chunked', { path }).then(chunked => {
          editorStore.setInitialContent(tabId, chunked.content);
          editorStore.updateTab(tabId, { isLargeFile: true, isPreview: true });
          syncToSplit();
        }).catch(err => {
          console.error('Failed to lazy load large tab:', err);
        }).finally(() => {
          editorStore.setTabLoading(tabId, false);
          loadingTabIds.delete(tabId);
        });
      } else {
        invoke<string>('read_file_text', { path }).then(content => {
          editorStore.setInitialContent(tabId, content);
          syncToSplit();
        }).catch(async err => {
          if (String(err) === '__BINARY__') {
            editorStore.setTabUnsupported(tabId, true);
            editorStore.setInitialContent(tabId, '');
          } else if (String(err) === '__LARGE_FILE__') {
            try {
              const chunked = await invoke<any>('read_file_chunked', { path });
              editorStore.setInitialContent(tabId, chunked.content);
              editorStore.updateTab(tabId, { isLargeFile: true, isPreview: true });
              syncToSplit();
            } catch (e) { console.error(e); }
          } else {
            console.error('Failed to lazy load tab:', err);
          }
        }).finally(() => {
          editorStore.setTabLoading(tabId, false);
          loadingTabIds.delete(tabId);
        });
      }
    }
  });

  // Context menu state
  let ctxMenu = $state({
    isOpen: false,
    x: 0,
    y: 0,
    targetTabId: null as string | null,
    items: [] as any[],
  });

  function closeCtxMenu() {
    ctxMenu.isOpen = false;
  }

  function handleTabContextMenu(e: MouseEvent, tabId: string) {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('close-context-menus'));

    const tab = tabs.find(t => t.id === tabId);
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (!tab) return;

    ctxMenu.targetTabId = tabId;
    ctxMenu.items = [
      {
        id: 'close',
        label: 'Close Tab',
        shortcut: 'Ctrl+W',
        action: () => handleTabClose(tabId),
      },
      {
        id: 'close_other',
        label: 'Close Other',
        disabled: tabs.length <= 1,
        action: () => {
          tabs.forEach(t => { if (t.id !== tabId) handleTabClose(t.id); });
        },
      },
      {
        id: 'close_right',
        label: 'Close to the Right',
        disabled: tabIndex === -1 || tabIndex === tabs.length - 1,
        action: () => {
          for (let i = tabIndex + 1; i < tabs.length; i++) handleTabClose(tabs[i].id);
        },
      },
      { separator: true },
      {
        id: 'copy_path',
        label: 'Copy Path',
        action: () => navigator.clipboard.writeText(tab.path).catch(console.error),
      },
    ];
    ctxMenu.x = e.clientX;
    ctxMenu.y = e.clientY;
    ctxMenu.isOpen = true;
  }

  function handleEmptyAreaContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('close-context-menus'));

    const hasTerminal = $terminalStore.terminals.length > 0;

    ctxMenu.targetTabId = null;
    ctxMenu.items = [
      {
        id: 'new_text_file',
        label: 'New Text File',
        shortcut: 'Ctrl+N',
        action: () => { splitStore.setActivePane(paneId); onNewTextFile?.(); },
      },
      {
        id: 'open_file',
        label: 'Open File',
        shortcut: 'Ctrl+O',
        action: () => { splitStore.setActivePane(paneId); onOpenFile?.(); },
      },
      { separator: true },
      {
        id: 'split_up',
        label: 'Split Up',
        action: () => splitStore.splitPane(paneId, 'up'),
      },
      {
        id: 'split_down',
        label: 'Split Down',
        action: () => splitStore.splitPane(paneId, 'down'),
      },
      {
        id: 'split_left',
        label: 'Split Left',
        action: () => splitStore.splitPane(paneId, 'left'),
      },
      {
        id: 'split_right',
        label: 'Split Right',
        action: () => splitStore.splitPane(paneId, 'right'),
      },
      { separator: true },
      {
        id: 'terminal',
        label: hasTerminal ? 'Open Terminal' : 'New Terminal',
        action: () => onOpenTerminal?.(),
      },
      {
        id: 'new_window',
        label: 'New Window',
        action: () => invoke('new_window').catch(console.error),
      },
    ];
    ctxMenu.x = e.clientX;
    ctxMenu.y = e.clientY;
    ctxMenu.isOpen = true;
  }

  function handleTabClose(tabId: string) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    if (tab.isModified || (tab.path.startsWith('Untitled') && tab.content && tab.content.trim() !== '')) {
      // Delegate to App via a custom event
      window.dispatchEvent(new CustomEvent('split:request-close-tab', { detail: { tabId, paneId } }));
    } else {
      splitStore.closeTabInPane(paneId, tabId);
      editorStore.closeTab(tabId);
    }
  }

  function handlePaneActivate() {
    if (!isActive) splitStore.setActivePane(paneId);
  }

  function handleClosePane() {
    // Close pane (must have at least one remaining)
    splitStore.closePane(paneId);
  }

  // Keyboard: Ctrl+W closes tab or pane
  function handleKeydown(e: KeyboardEvent) {
    const isMac = navigator.userAgent.toLowerCase().includes('mac');
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
    const key = e.key.toLowerCase();

    if (cmdOrCtrl && key === 'w') {
      e.preventDefault();
      e.stopPropagation();
      if (activeTabId) {
        handleTabClose(activeTabId);
        // If no tabs left after close, close the pane (if > 1 pane exists)
        const paneAfter = splitStore.getSnapshot().panes[paneId];
        if (paneAfter && paneAfter.tabs.length === 0) {
          const allPaneIds = splitStore.collectPaneIds();
          if (allPaneIds.length > 1) {
            splitStore.closePane(paneId);
          }
        }
      } else {
        // No tabs — close pane
        const allPaneIds = splitStore.collectPaneIds();
        if (allPaneIds.length > 1) {
          splitStore.closePane(paneId);
        }
      }
    }
  }

  // Precomputed name→count map
  const tabNameCounts = $derived(
    tabs.reduce((m, t: any) => {
      if (t.path?.startsWith('Untitled')) return m;
      m.set(t.name, (m.get(t.name) ?? 0) + 1);
      return m;
    }, new Map<string, number>())
  );

  // Close context menus on global events
  $effect(() => {
    const handler = () => closeCtxMenu();
    window.addEventListener('close-context-menus', handler);
    window.addEventListener('click', handler, { capture: true });
    return () => {
      window.removeEventListener('close-context-menus', handler);
      window.removeEventListener('click', handler, { capture: true });
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="pane-container flex flex-col h-full w-full overflow-hidden"
  class:pane-active={isActive}
  onmousedowncapture={handlePaneActivate}
  onkeydown={handleKeydown}
  tabindex="-1"
  role="region"
  aria-label="Editor Pane"
>
  <!-- Tab Bar -->
  {#if tabs.length > 0}
  <div class="pane-tabs flex h-9 shrink-0 bg-surface-2 border-b border-subtle relative" oncontextmenu={handleEmptyAreaContextMenu}>
    <!-- Close Pane Button (top-right) -->
    {#if totalPanes > 1}
    <button
      class="pane-close-btn absolute right-1 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 rounded text-icon-default hover:text-icon-active hover:bg-hover transition-colors"
      onclick={(e) => { e.stopPropagation(); handleClosePane(); }}
      title="Close Pane"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
    {/if}

    <!-- Tabs List -->
    <div role="tablist" tabindex="-1" class="flex flex-1 overflow-x-auto scrollbar-hide pr-6" oncontextmenu={handleEmptyAreaContextMenu}>
      {#each tabs as tab (tab.id)}
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          role="tab"
          tabindex="0"
          class="flex shrink-0 items-center gap-2 px-3 min-w-28 cursor-pointer border-t border-l border-r border-subtle -ml-px first:ml-0"
          class:bg-canvas={activeTabId === tab.id}
          class:text-primary={activeTabId === tab.id}
          class:border-t-2={activeTabId === tab.id}
          class:border-t-indicator-active={activeTabId === tab.id}
          class:bg-surface-2={activeTabId !== tab.id}
          class:text-secondary={activeTabId !== tab.id}
          class:hover:bg-hover={activeTabId !== tab.id}
          class:hover:text-primary={activeTabId !== tab.id}
          onclick={(e) => { e.stopPropagation(); splitStore.setActivePaneTab(paneId, tab.id); handlePaneActivate(); }}
          ondblclick={() => editorStore.pinTab(tab.id)}
          onkeydown={(e) => { if (e.key === 'Enter') { splitStore.setActivePaneTab(paneId, tab.id); handlePaneActivate(); } }}
          oncontextmenu={(e) => handleTabContextMenu(e, tab.id)}
        >
          {#if tab.language === 'welcome'}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024" fill="currentColor" class="w-3.5 h-auto opacity-80 pointer-events-none text-primary shrink-0">
              <path fill-rule="evenodd" d="M 472 343 L 473 347 L 473 355 L 472 356 L 473 357 L 472 358 L 472 372 L 473 373 L 472 374 L 472 385 L 473 386 L 472 387 L 473 388 L 472 389 L 473 394 L 472 395 L 473 396 L 472 397 L 473 398 L 472 399 L 473 401 L 472 403 L 473 404 L 473 423 L 472 424 L 473 426 L 473 431 L 472 432 L 473 433 L 473 439 L 472 440 L 473 441 L 473 454 L 472 455 L 473 456 L 473 463 L 472 464 L 473 466 L 473 754 L 476 762 L 484 770 L 494 774 L 503 774 L 523 767 L 597 735 L 613 726 L 620 716 L 622 710 L 622 482 L 506 381 L 492 370 L 479 356 L 473 343 Z " />
            </svg>
          {:else if tab.language === 'image'}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-icon-default"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
          {:else if tab.language === 'settings'}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-icon-default"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          {:else if tab.language === 'markdown-preview'}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-icon-default"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
          {:else}
            {@const iconTheme = settingsStore.effectiveSettings.icon_theme}
            {@const baseName = tab.path ? tab.path.split(/[/\\]/).pop() || tab.name : tab.name}
            {#if !iconTheme || iconTheme === 'default'}
              {@const Icon = getFileIcon(baseName)}
              <Icon size={14} class="shrink-0 text-icon-default" />
            {:else if iconTheme === 'material'}
              <MaterialIcon name={baseName} size={14} />
            {/if}
          {/if}

          <span class="text-xs whitespace-nowrap" class:italic={tab.isPreview}>
            {(() => {
              if ((tabNameCounts.get(tab.name) ?? 0) > 1 && !tab.path.startsWith('Untitled')) {
                const parts = tab.path.split(/[/\\]/);
                if (parts.length >= 2) return `${tab.name} \u00A0...${parts[parts.length - 2]}`;
              }
              return tab.name;
            })()}
          </span>

          {#if tab.language !== 'welcome'}
            {#if tab.isModified}
              <div class="w-2 h-2 rounded-full bg-accent shrink-0"></div>
            {:else if tab.status === 'conflict'}
              <div class="w-2 h-2 rounded-full bg-warning shrink-0" title="External changes detected"></div>
            {:else if tab.status === 'deleted'}
              <div class="w-2 h-2 rounded-full bg-error shrink-0" title="File deleted"></div>
            {/if}
          {/if}

          <button
            class="p-0.5 rounded transition-colors hover:bg-active text-icon-default hover:text-icon-active shrink-0"
            onclick={(e) => { e.stopPropagation(); handleTabClose(tab.id); }}
            aria-label="Close tab"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      {/each}
    </div>
  </div>
  {/if}

  <!-- Editor Content Area -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="flex-1 relative overflow-hidden" oncontextmenu={handleEmptyAreaContextMenu}>
    {#if tabs.length === 0}
      <!-- Empty pane placeholder with context menu hint -->
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted select-none" oncontextmenu={handleEmptyAreaContextMenu}>
        {#if totalPanes > 1}
          <button
            class="absolute top-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded text-icon-default hover:text-icon-active hover:bg-hover transition-colors"
            onclick={(e) => { e.stopPropagation(); handleClosePane(); }}
            title="Close Pane"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        {/if}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024" fill="currentColor" class="w-[min(30vw,200px)] h-auto pointer-events-none text-primary/30">
          <path fill-rule="evenodd" d="M 472 343 L 473 347 L 473 355 L 472 356 L 473 357 L 472 358 L 472 372 L 473 373 L 472 374 L 472 385 L 473 386 L 472 387 L 473 388 L 472 389 L 473 394 L 472 395 L 473 396 L 472 397 L 473 398 L 472 399 L 473 401 L 472 403 L 473 404 L 473 423 L 472 424 L 473 426 L 473 431 L 472 432 L 473 433 L 473 439 L 472 440 L 473 441 L 473 454 L 472 455 L 473 456 L 473 463 L 472 464 L 473 466 L 473 754 L 476 762 L 484 770 L 494 774 L 503 774 L 523 767 L 597 735 L 613 726 L 620 716 L 622 710 L 622 482 L 506 381 L 492 370 L 479 356 L 473 343 Z "/>
          <path fill-rule="evenodd" d="M 480 260 L 475 267 L 473 273 L 473 333 L 475 340 L 481 351 L 495 365 L 508 375 L 517 384 L 522 387 L 538 402 L 678 522 L 696 536 L 729 565 L 963 761 L 972 765 L 986 765 L 998 760 L 1046 735 L 1052 731 L 1059 724 L 1063 715 L 1063 645 L 1058 629 L 1052 620 L 1041 609 L 1006 581 L 861 458 L 721 336 L 592 221 L 582 215 L 577 214 L 568 214 L 562 216 L 498 249 Z "/>
          <path fill-rule="evenodd" d="M 1029 196 L 999 208 L 994 209 L 961 223 L 956 224 L 943 230 L 938 231 L 928 236 L 918 239 L 911 243 L 905 249 L 902 254 L 900 261 L 900 484 L 1041 601 L 1056 617 L 1061 627 L 1063 635 L 1063 217 L 1058 207 L 1051 200 L 1042 196 Z "/>
        </svg>
        <div class="flex flex-col gap-2 items-center text-xs opacity-70">
          <div class="flex items-center gap-4 hover:opacity-100 transition-opacity">
            <span class="w-24 text-right">New File</span>
            <kbd class="px-2 py-0.5 rounded text-xs bg-surface-2 border border-subtle">Ctrl+N</kbd>
          </div>
          <div class="flex items-center gap-4 hover:opacity-100 transition-opacity">
            <span class="w-24 text-right">Open File</span>
            <kbd class="px-2 py-0.5 rounded text-xs bg-surface-2 border border-subtle">Ctrl+O</kbd>
          </div>
          <div class="flex items-center gap-4 hover:opacity-100 transition-opacity">
            <span class="w-24 text-right">Commands</span>
            <kbd class="px-2 py-0.5 rounded text-xs bg-surface-2 border border-subtle">Ctrl+Shift+P</kbd>
          </div>
        </div>
      </div>
    {:else if activeTab}
      {#if activeTab.language === 'markdown-preview' && MarkdownPreviewComponent}
        <MarkdownPreviewComponent key={activeTab.id} path={activeTab.path} />
      {:else if !activeTab.noPreview && (activeTab.path.toLowerCase().endsWith('.svg') || activeTab.path.toLowerCase().endsWith('.md') || activeTab.language === 'markdown')}
        {@const isMd = activeTab.path.toLowerCase().endsWith('.md') || activeTab.language === 'markdown'}
        {@const viewMode = isMd ? (activeTab.mdViewMode || settingsStore.effectiveSettings.default_md_view || 'preview') : (activeTab.svgViewMode || settingsStore.effectiveSettings.default_svg_view || 'image')}
        
        {#if EditorComponent && activeTab.content !== null}
          {#key activeTab.id}
            <EditorComponent tabId={activeTab.id} content={activeTab.content} filePath={activeTab.path} hideContent={true} isHeaderOnly={true}>
              {#snippet topRightOverlay()}
                {#if isMd}
                  <MarkdownViewToggle {activeTab} />
                {:else}
                  <SvgViewToggle {activeTab} />
                {/if}
              {/snippet}

              {#if viewMode === 'image' || viewMode === 'preview'}
                <div class="absolute inset-0 bg-canvas">
                  {#if isMd && MarkdownPreviewComponent}
                    <MarkdownPreviewComponent key={activeTab.id} path={activeTab.path} />
                  {:else if !isMd && ImageViewerComponent}
                    <ImageViewerComponent key={activeTab.id} filePath={activeTab.path} gitRevision={activeTab.gitRevision} />
                  {/if}
                </div>
              {:else if viewMode === 'code'}
                <div class="absolute inset-0 [&_.cm-panels-top]:!hidden bg-canvas">
                  <EditorComponent tabId={activeTab.id} content={activeTab.content} filePath={activeTab.path} />
                </div>
              {:else if viewMode === 'split'}
                <div class="absolute inset-0 flex h-full w-full bg-canvas">
                  {#if isMd}
                    <div class="flex-1 flex overflow-hidden relative border-r border-border [&_.cm-panels-top]:!hidden">
                      <EditorComponent tabId={activeTab.id} content={activeTab.content} filePath={activeTab.path} />
                    </div>
                    <div class="flex-1 flex overflow-hidden relative">
                      {#if MarkdownPreviewComponent}
                        <MarkdownPreviewComponent key={activeTab.id} path={activeTab.path} />
                      {/if}
                    </div>
                  {:else}
                    <div class="flex-1 flex overflow-hidden relative border-r border-border">
                      {#if ImageViewerComponent}
                        <ImageViewerComponent key={activeTab.id} filePath={activeTab.path} gitRevision={activeTab.gitRevision} />
                      {/if}
                    </div>
                    <div class="flex-1 flex overflow-hidden relative [&_.cm-panels-top]:!hidden">
                      <EditorComponent tabId={activeTab.id} content={activeTab.content} filePath={activeTab.path} />
                    </div>
                  {/if}
                </div>
              {/if}
            </EditorComponent>
          {/key}
        {:else}
          <div class="absolute inset-0 bg-canvas"></div>
        {/if}
      {:else if activeTab.language === 'image-diff' && ImageDiffComponent}
        <ImageDiffComponent 
          key={activeTab.id} 
          filePath={activeTab.path} 
          originalLabel={activeTab.diffOriginalLabel} 
          currentLabel={activeTab.diffCurrentLabel} 
          originalRevision={activeTab.diffOriginalRevision} 
          currentRevision={activeTab.diffCurrentRevision} 
        />
      {:else if activeTab.language === 'image' && ImageViewerComponent}
        <ImageViewerComponent key={activeTab.id} filePath={activeTab.path} gitRevision={activeTab.gitRevision} />
      {:else if activeTab.language === 'welcome' && WelcomeTabComponent}
        <WelcomeTabComponent />
      {:else if activeTab.language === 'settings' && SettingsPageComponent}
        <SettingsPageComponent />
      {:else if activeTab.isLoading}
        <div class="absolute inset-0 bg-canvas"></div>
      {:else if activeTab.isUnsupported}
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted bg-canvas select-none">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="opacity-50"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          <span class="text-sm">Binary or unsupported file encoding.</span>
        </div>
      {:else if activeTab.content === null}
        <div class="absolute inset-0 bg-canvas"></div>
      {:else if activeTab.isDiff && DiffEditorComponent}
        {#key activeTab.id}
          <DiffEditorComponent
            originalContent={activeTab.diffOriginalContent}
            currentContent={activeTab.content}
            filePath={activeTab.path}
            originalLabel={activeTab.diffOriginalLabel}
            currentLabel={activeTab.diffCurrentLabel}
            editable={activeTab.diffEditable}
            onCurrentChange={(c: string) => editorStore.updateContent(activeTab.id, c)}
          />
        {/key}
      {:else if !activeTab.isDiff && EditorComponent}
        {#key activeTab.id}
          <EditorComponent tabId={activeTab.id} content={activeTab.content} filePath={activeTab.path} readOnly={activeTab.readOnly} />
        {/key}
      {:else}
        <div class="absolute inset-0 bg-canvas"></div>
      {/if}
    {/if}
  </div>
</div>

<!-- Tab Context Menu (pane-local) -->
{#if ctxMenu.isOpen}
  <div
    data-notron-context-menu="true"
    class="fixed min-w-[180px] rounded-md border p-1 shadow-elevated z-[100] animate-in fade-in duration-100 bg-surface-2 border-subtle text-primary"
    style="left: {ctxMenu.x}px; top: {ctxMenu.y}px;"
    role="presentation"
    onclick={(e) => e.stopPropagation()}
    oncontextmenu={(e) => e.stopPropagation()}
  >
    {#each ctxMenu.items as item, i (item.id || i)}
      {#if item.separator}
        <div class="h-px my-1 bg-subtle"></div>
      {:else}
        <button
          class="flex items-center justify-between w-full px-2 py-1.5 text-xs rounded-sm cursor-pointer select-none outline-none transition-colors {!item.disabled ? 'hover:bg-selected focus:bg-selected hover:text-primary focus:text-primary text-secondary' : 'text-muted opacity-50 cursor-not-allowed'}"
          disabled={item.disabled}
          onclick={(e) => { e.stopPropagation(); if (item.action) item.action(); closeCtxMenu(); }}
        >
          <span>{item.label}</span>
          {#if item.shortcut}
            <span class="ml-auto text-[10px] text-muted opacity-80 pl-4">{item.shortcut}</span>
          {/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .pane-container {
    outline: none;
  }
  .pane-active .pane-tabs {
    border-bottom-color: var(--color-indicator-active, #007acc);
    border-bottom-width: 1px;
    box-shadow: inset 0 -1px 0 var(--color-indicator-active, #007acc);
  }
  .pane-active {
    box-shadow: inset 0 0 0 1px rgba(0, 122, 204, 0.35);
  }
  .pane-close-btn {
    opacity: 0;
    transition: opacity 0.15s;
  }
  .pane-tabs:hover .pane-close-btn {
    opacity: 1;
  }
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>
