<script lang="ts">
  import { editorStore } from '../../stores/editor';
  import { splitStore } from '../../stores/split';
  import { uiStore } from '../../stores/ui';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { open, save } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';
  import { getHumanReadableError } from '../../utils/error';
  import { terminalStore } from '../../stores/terminal';

  const tabs = editorStore.tabs;
  const activeTabId = editorStore.activeTabId;
  const ui = uiStore;

  let activeTab = $derived($tabs.find(t => t.id === $activeTabId) || null);
  let isFileActive = $derived(!!activeTab);

  let openMenu = $state<string | null>(null);

  function handleNewTextFile() {
    let count = 1;
    const tabsSnapshot = editorStore.getTabsSnapshot();
    while (tabsSnapshot.some((t: any) => t.path === `Untitled-${count}`)) count++;
    const name = `Untitled-${count}`;
    const id = `tab-${Date.now()}`;
    const tab = { id, path: name, name, content: '', language: 'plaintext', isPreview: false };
    editorStore.addTab(tab);
    editorStore.setActiveTab(id);
    const activePaneId = splitStore.getSnapshot().activePaneId;
    if (activePaneId) {
      splitStore.addTabToPane(activePaneId, { ...tab, originalContent: '', isModified: false, lastAccessed: Date.now(), status: 'active' });
    }
    closeAll();
  }

  async function handleNewWindow() { 
    try {
      await invoke('open_new_window');
      closeAll();
    } catch (e) {
      console.error('Failed to open new window', e);
    }
  }

  async function handleOpenFile() {
    try {
      const selected = await open({ multiple: false });
      if (selected && typeof selected === 'string') {
        window.dispatchEvent(new CustomEvent('request-open-file', { detail: { path: selected } }));
      }
    } catch (err) { console.error(err); }
    closeAll();
  }

  async function handleOpenFolder() {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        if (selected === uiStore.getSnapshot().explorerRoot) {
          closeAll();
          return;
        }
        if (!$ui.recentWorkspaces.includes(selected)) {
          uiStore.setPendingTrustPath(selected);
        } else {
          window.dispatchEvent(new CustomEvent('request-workspace-switch', { detail: { path: selected } }));
        }
      }
    } catch (err) { console.error("Failed to open folder:", err); }
    closeAll();
  }

  async function handleSave() {
    if (!activeTab) return;
    if (activeTab.path.startsWith('Untitled')) {
      const selected = await save();
      if (selected && typeof selected === 'string') {
        const fileName = selected.split(/[/\\]/).pop() || 'Unknown';
        try {
          await invoke('save_file', { path: selected, content: activeTab.content });
          // Keep the same tab id — update path/name in BOTH stores so the
          // pane tab bar follows the save.
          editorStore.updateTab(activeTab.id, { path: selected, name: fileName });
          splitStore.updateTabInAllPanes({ id: activeTab.id, path: selected, name: fileName });
          editorStore.markSaved(activeTab.id);
        } catch (err) {
          console.error(err);
          uiStore.addToast('Save Failed', 'alert', getHumanReadableError(err));
        }
      }
    } else {
      try {
        await invoke('save_file', { path: activeTab.path, content: activeTab.content });
        editorStore.markSaved(activeTab.id);
        uiStore.addToast('Saved manually', 'success');
      } catch (err) {
        console.error(err);
        uiStore.addToast('Save Failed', 'alert', getHumanReadableError(err));
      }
    }
    closeAll();
  }

  async function handleSaveAs() {
    if (!activeTab) return;
    const selected = await save();
    if (selected && typeof selected === 'string') {
      try {
        await invoke('save_file', { path: selected, content: activeTab.content });
        const fileName = selected.split(/[/\\]/).pop() || 'Unknown';
        // Keep the same tab id — update path/name in BOTH stores so the pane
        // tab bar follows the save.
        editorStore.updateTab(activeTab.id, { path: selected, name: fileName });
        splitStore.updateTabInAllPanes({ id: activeTab.id, path: selected, name: fileName });
        editorStore.markSaved(activeTab.id);
        uiStore.addToast('Saved manually', 'success');
      } catch (err) {
        console.error(err);
        uiStore.addToast('Save Failed', 'alert', getHumanReadableError(err));
      }
    }
    closeAll();
  }

  function handleExit() { getCurrentWindow().close(); }

  function openSearch() { uiStore.setActiveSidebarPanel('search'); uiStore.setSidebarOpen(true); closeAll(); }
  function openExplorer() { uiStore.setActiveSidebarPanel('explorer'); uiStore.setSidebarOpen(true); closeAll(); }

  function dispatchEditorAction(action: string) {
    window.dispatchEvent(new CustomEvent('editor:action', { detail: { action } }));
    closeAll();
  }

  function closeAll() { openMenu = null; }

  $effect(() => {
    const onSave = () => handleSave();
    const onSaveAs = () => handleSaveAs();
    window.addEventListener('editor:save', onSave);
    window.addEventListener('editor:save-as', onSaveAs);
    return () => {
      window.removeEventListener('editor:save', onSave);
      window.removeEventListener('editor:save-as', onSaveAs);
    };
  });

  function toggleMenu(name: string) {
    openMenu = openMenu === name ? null : name;
  }

  function isDisabled() { return !isFileActive; }
  function isMinimapChecked() { return $ui.isMinimapEnabled; }

  const menus = [
    {
      label: 'File', items: [
        { label: 'New Text File', action: handleNewTextFile },
        { label: 'New File', action: () => { uiStore.openNewFileDialog('menu'); closeAll(); }, shortcut: 'Ctrl+N' },
        { label: 'New Window', action: handleNewWindow, sep: true, shortcut: 'Ctrl+Shift+N' },
        { label: 'Open File', action: handleOpenFile, shortcut: 'Ctrl+O' },
        { label: 'Open Folder', action: handleOpenFolder },
        { label: 'Open Recent...', action: () => { uiStore.openRecentFoldersModal(); closeAll(); }, sep: true },
        { label: 'Save', action: handleSave, disabled: isDisabled, shortcut: 'Ctrl+S' },
        { label: 'Save As', action: handleSaveAs, disabled: isDisabled, sep: true, shortcut: 'Ctrl+Shift+S' },
        { label: 'Exit', action: handleExit }
      ]
    },
    {
      label: 'Edit', items: [
        { label: 'Undo', action: () => dispatchEditorAction('undo'), disabled: isDisabled, shortcut: 'Ctrl+Z' },
        { label: 'Redo', action: () => dispatchEditorAction('redo'), disabled: isDisabled, sep: true, shortcut: 'Ctrl+Y' },
        { label: 'Cut', action: () => document.execCommand('cut'), shortcut: 'Ctrl+X' },
        { label: 'Copy', action: () => document.execCommand('copy'), shortcut: 'Ctrl+C' },
        { label: 'Paste', action: () => document.execCommand('paste'), sep: true, shortcut: 'Ctrl+V' },
        { label: 'Find', action: () => dispatchEditorAction('find'), disabled: isDisabled, shortcut: 'Ctrl+F' },
        { label: 'Replace', action: () => dispatchEditorAction('replace'), disabled: isDisabled, sep: true, shortcut: 'Ctrl+H' },
        { label: 'Reopen Closed Tab', action: () => editorStore.reopenClosedTab(), sep: true, shortcut: 'Ctrl+Shift+T' },
        { label: 'Find in Files', action: openSearch, shortcut: 'Ctrl+Shift+F' },
        { label: 'Replace in Files', action: openSearch, shortcut: 'Ctrl+Shift+H' }
      ]
    },
    {
      label: 'Selection', items: [
        { label: 'Select All', action: () => dispatchEditorAction('selectAll'), disabled: isDisabled, sep: true, shortcut: 'Ctrl+A' },
        { label: 'Copy Line Up', action: () => dispatchEditorAction('copyLineUp'), disabled: isDisabled, shortcut: 'Shift+Alt+Up' },
        { label: 'Copy Line Down', action: () => dispatchEditorAction('copyLineDown'), disabled: isDisabled, shortcut: 'Shift+Alt+Down' },
        { label: 'Move Line Up', action: () => dispatchEditorAction('moveLineUp'), disabled: isDisabled, shortcut: 'Alt+Up' },
        { label: 'Move Line Down', action: () => dispatchEditorAction('moveLineDown'), disabled: isDisabled, sep: true, shortcut: 'Alt+Down' },
        { label: 'Duplicate Selection', action: () => dispatchEditorAction('copyLineDown'), disabled: isDisabled }
      ]
    },
    {
      label: 'Terminal', items: [
        { 
          label: 'Open Terminal', 
          disabled: () => $terminalStore.terminals.length === 0 || $terminalStore.isVisible,
          shortcut: 'Ctrl+`',
          action: () => { 
            terminalStore.setVisibility(true); 
            closeAll(); 
          } 
        },
        { label: 'New Terminal', shortcut: 'Ctrl+Shift+`', action: () => { 
            const cwd = uiStore.getSnapshot().explorerRoot || '';
            terminalStore.newTerminal(undefined, cwd); 
            closeAll(); 
          } 
        }
      ]
    },
    {
      label: 'View', items: [
        { label: 'Command Palette', action: () => { window.dispatchEvent(new CustomEvent('open-command-palette')); closeAll(); }, sep: true, shortcut: 'Ctrl+Shift+P' },
        { label: 'Explorer', action: openExplorer, shortcut: 'Ctrl+Shift+E' },
        { label: 'Search', action: openSearch, shortcut: 'Ctrl+Shift+F' },
        { label: 'Terminal', action: () => {
            if ($terminalStore.terminals.length === 0) {
              const cwd = uiStore.getSnapshot().explorerRoot || '';
              terminalStore.newTerminal(undefined, cwd);
            }
            terminalStore.setActivePanel('terminal');
            closeAll();
          }, shortcut: 'Ctrl+`'
        },
        { label: 'Problems', action: () => {
            terminalStore.setActivePanel('problems');
            closeAll();
          }
        },
        { label: 'Output', action: () => {
            terminalStore.setActivePanel('output');
            closeAll();
          }, sep: true
        },
        { label: 'Welcome Page', action: () => {
            const w = $tabs.find((t: any) => t.language === 'welcome');
            if (w) editorStore.setActiveTab(w.id);
            else editorStore.addTab({ id: 'welcome', path: 'Welcome', name: 'Welcome', content: '', language: 'welcome', isPreview: true });
            closeAll();
          }, checked: () => $tabs.some((t: any) => t.language === 'welcome') },
        { label: 'Minimap', action: () => { uiStore.toggleMinimap(); closeAll(); }, checked: isMinimapChecked }
      ]
    }
  ];
</script>

<svelte:window onclick={closeAll} />

<div class="flex items-center text-xs h-full ml-2 space-x-1">
  {#each menus as menu (menu.label)}
    <div class="relative">
      <button
        class="px-2 py-1 rounded outline-none cursor-pointer select-none transition-colors hover:bg-hover hover:text-primary"
        class:bg-selected={openMenu === menu.label}
        class:text-primary={openMenu === menu.label}
        onclick={(e) => { e.stopPropagation(); toggleMenu(menu.label); }}
      >
        {menu.label}
      </button>

      {#if openMenu === menu.label}
        <div
          role="menu"
          tabindex="0"
          class="absolute top-full left-0 min-w-[240px] rounded border shadow-elevated z-[100] py-1 bg-surface-2 border-subtle text-primary"
          onclick={(e) => { e.stopPropagation(); closeAll(); }}
          onkeydown={(e) => { if (e.key === 'Escape') closeAll(); }}
        >
          {#each menu.items as item (item.label)}
              <button
                class="flex items-center justify-between w-full px-3 py-1.5 text-xs outline-none cursor-pointer select-none {!(item as any).disabled?.() ? 'hover:bg-selected focus:bg-selected text-secondary hover:text-primary transition-colors' : 'text-muted'}"
                disabled={(item as any).disabled?.()}
                onclick={() => { if (!((item as any).disabled?.())) { (item as any).action(); } }}
                onmouseenter={(e) => (e.target as HTMLElement).focus()}
              >
                <div class="flex items-center">
                  <div class="w-4 mr-2 flex justify-center items-center">
                    {#if (item as any).checked?.()}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>{/if}
                  </div>
                  {(item as any).label}
                </div>
                {#if (item as any).shortcut}
                  <span class="ml-4 text-[10px] text-muted opacity-80">{(item as any).shortcut}</span>
                {/if}
              </button>
            {#if (item as any).sep}
              <div class="h-px my-1 bg-subtle"></div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>
