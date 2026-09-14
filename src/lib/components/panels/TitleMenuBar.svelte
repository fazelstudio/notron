<!--
 * Title Menu Bar
 *
 * Application menu bar for the title bar.
-->

<script lang="ts">
  import { editorStore } from '../../stores/editor';
  import { splitStore } from '../../stores/split';
  import { uiStore } from '../../stores/ui';
  import { commandRegistry } from '../../commands/registry';
  import { eventBus } from '../../utils/eventBus';
  import { menuRegistry } from '../../workbench/menuRegistry';
  import { onMount } from 'svelte';
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
    const tab = { id, path: name, name, content: '', language: 'plaintext', languageDetected: true, isPreview: false };
    editorStore.addTab(tab);
    editorStore.setActiveTab(id);
    const activePaneId = splitStore.getSnapshot().activePaneId;
    if (activePaneId) {
      splitStore.addTabToPane(activePaneId, { ...tab, originalContent: '', isModified: false, lastAccessed: Date.now(), status: 'active' });
    }
    closeAll();
  }

  async function handleNewWindow() { 
    void commandRegistry.execute('window.newWindow').then(() => closeAll());
  }

  async function handleOpenFile() {
    void commandRegistry.execute('workbench.action.files.openFile').then(() => closeAll());
  }

  async function handleOpenFolder() {
    void commandRegistry.execute('workbench.action.files.openFolder').then(() => closeAll());
  }

  async function handleSave() {
    void commandRegistry.execute('workbench.action.files.save').then(() => closeAll());
  }

  async function handleSaveAs() {
    void commandRegistry.execute('workbench.action.files.saveAs').then(() => closeAll());
  }

  function handleExit() { void commandRegistry.execute('window.close'); }

  function openSearch() { void commandRegistry.execute('workbench.view.search').then(() => closeAll()); }
  function openExplorer() { void commandRegistry.execute('workbench.view.explorer').then(() => closeAll()); }

  function dispatchEditorAction(action: string) {
    const map: Record<string,string> = {
      undo: 'editor.action.undo', redo: 'editor.action.redo',
      cut: 'editor.action.clipboardCutAction', copy: 'editor.action.clipboardCopyAction', paste: 'editor.action.clipboardPasteAction',
      find: 'editor.action.find', replace: 'editor.action.replace',
      selectAll: 'editor.action.selectAll', copyLineUp: 'editor.action.copyLinesUpAction', copyLineDown: 'editor.action.copyLinesDownAction',
      moveLineUp: 'editor.action.moveLinesUpAction', moveLineDown: 'editor.action.moveLinesDownAction'
    };
    const cmd = map[action];
    if (cmd && commandRegistry.has(cmd)) void commandRegistry.execute(cmd).then(() => closeAll());
    else { eventBus.emit('editor:action', { action }); closeAll(); }
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
  function isBreadcrumbsChecked() { return $ui.isBreadcrumbsEnabled; }
  function isStickyScrollChecked() { return $ui.isStickyScrollEnabled; }
  function isStatusBarChecked() { return $ui.isStatusBarEnabled; }

  const menus = [
    {
      label: 'File', items: [
        { label: 'New Text File', command: 'workbench.action.files.newUntitledFile', action: handleNewTextFile },
        { label: 'New File', command: 'workbench.action.files.newFile', action: () => { uiStore.openNewFileDialog('menu'); closeAll(); }, shortcut: 'Ctrl+N' },
        { label: 'New Window', command: 'workbench.action.newWindow', action: handleNewWindow, sep: true, shortcut: 'Ctrl+Shift+N' },
        { label: 'Open File', command: 'workbench.action.files.openFile', action: handleOpenFile, shortcut: 'Ctrl+O' },
        { label: 'Open Folder', command: 'workbench.action.files.openFolder', action: handleOpenFolder },
        { label: 'Open Recent...', command: 'workbench.action.openRecent', action: () => { uiStore.openRecentFoldersModal(); closeAll(); }, sep: true },
        { label: 'Save', command: 'workbench.action.files.save', action: handleSave, disabled: isDisabled, shortcut: 'Ctrl+S' },
        { label: 'Save As', command: 'workbench.action.files.saveAs', action: handleSaveAs, disabled: isDisabled, sep: true, shortcut: 'Ctrl+Shift+S' },
        { label: 'Exit', command: 'workbench.action.closeWindow', action: handleExit }
      ]
    },
    {
      label: 'Edit', items: [
        { label: 'Undo', command: 'editor.action.undo', action: () => dispatchEditorAction('undo'), disabled: isDisabled, shortcut: 'Ctrl+Z' },
        { label: 'Redo', command: 'editor.action.redo', action: () => dispatchEditorAction('redo'), disabled: isDisabled, sep: true, shortcut: 'Ctrl+Y' },
        { label: 'Cut', command: 'editor.action.clipboardCutAction', action: () => document.execCommand('cut'), shortcut: 'Ctrl+X' },
        { label: 'Copy', command: 'editor.action.clipboardCopyAction', action: () => document.execCommand('copy'), shortcut: 'Ctrl+C' },
        { label: 'Paste', command: 'editor.action.clipboardPasteAction', action: () => document.execCommand('paste'), sep: true, shortcut: 'Ctrl+V' },
        { label: 'Find', command: 'actions.find', action: () => dispatchEditorAction('find'), disabled: isDisabled, shortcut: 'Ctrl+F' },
        { label: 'Replace', command: 'editor.action.startFindReplaceAction', action: () => dispatchEditorAction('replace'), disabled: isDisabled, sep: true, shortcut: 'Ctrl+H' },
        { label: 'Reopen Closed Tab', command: 'workbench.action.reopenClosedEditor', action: () => editorStore.reopenClosedTab(), sep: true, shortcut: 'Ctrl+Shift+T' },
        { label: 'Find in Files', command: 'workbench.action.findInFiles', action: openSearch, shortcut: 'Ctrl+Shift+F' },
        { label: 'Replace in Files', command: 'workbench.action.replaceInFiles', action: openSearch, shortcut: 'Ctrl+Shift+H' }
      ]
    },
    {
      label: 'Selection', items: [
        { label: 'Select All', command: 'editor.action.selectAll', action: () => dispatchEditorAction('selectAll'), disabled: isDisabled, sep: true, shortcut: 'Ctrl+A' },
        { label: 'Copy Line Up', command: 'editor.action.copyLinesUpAction', action: () => dispatchEditorAction('copyLineUp'), disabled: isDisabled, shortcut: 'Shift+Alt+Up' },
        { label: 'Copy Line Down', command: 'editor.action.copyLinesDownAction', action: () => dispatchEditorAction('copyLineDown'), disabled: isDisabled, shortcut: 'Shift+Alt+Down' },
        { label: 'Move Line Up', command: 'editor.action.moveLinesUpAction', action: () => dispatchEditorAction('moveLineUp'), disabled: isDisabled, shortcut: 'Alt+Up' },
        { label: 'Move Line Down', command: 'editor.action.moveLinesDownAction', action: () => dispatchEditorAction('moveLineDown'), disabled: isDisabled, sep: true, shortcut: 'Alt+Down' },
        { label: 'Duplicate Selection', command: 'editor.action.copyLinesDownAction', action: () => dispatchEditorAction('copyLineDown'), disabled: isDisabled }
      ]
    },
    {
      label: 'Terminal', items: [
        { 
          label: 'Open Terminal', 
          command: 'workbench.action.terminal.toggleTerminal',
          disabled: () => $terminalStore.terminals.length === 0 || $terminalStore.isVisible,
          shortcut: 'Ctrl+`',
          action: () => { terminalStore.setVisibility(true); closeAll(); }
        },
        { label: 'New Terminal', command: 'workbench.action.terminal.new', shortcut: 'Ctrl+Shift+`', action: () => {
            const cwd = uiStore.getSnapshot().explorerRoot || '';
            terminalStore.newTerminal(undefined, cwd); 
            closeAll(); 
          } 
        }
      ]
    },
    {
      label: 'View', items: [
        { label: 'Command Palette', command: 'workbench.action.showCommands', action: () => { eventBus.emit('open-command-palette'); closeAll(); }, sep: true, shortcut: 'Ctrl+Shift+P' },
        { label: 'Explorer', command: 'workbench.view.explorer', action: openExplorer, shortcut: 'Ctrl+Shift+E' },
        { label: 'Search', command: 'workbench.view.search', action: openSearch, shortcut: 'Ctrl+Shift+F' },
        { label: 'Terminal', command: 'workbench.action.terminal.toggleTerminal', action: () => {
            if ($terminalStore.terminals.length === 0) {
              const cwd = uiStore.getSnapshot().explorerRoot || '';
              terminalStore.newTerminal(undefined, cwd);
            }
            terminalStore.setActivePanel('terminal');
            closeAll();
          }, shortcut: 'Ctrl+`'
        },
        { label: 'Problems', command: 'workbench.actions.view.problems', action: () => { terminalStore.setActivePanel('problems'); closeAll(); } },
        { label: 'Output', command: 'workbench.actions.view.output', action: () => { terminalStore.setActivePanel('output'); closeAll(); }, sep: true },
        { label: 'Welcome Page', command: 'workbench.action.showWelcomePage', action: () => { void commandRegistry.execute('workbench.action.showWelcomePage').then(() => closeAll()); }, checked: () => $tabs.some((t: any) => t.language === 'welcome') },
        { label: 'Minimap', command: 'workbench.action.toggleMinimap', action: () => { uiStore.toggleMinimap(); closeAll(); }, checked: isMinimapChecked },
        { label: 'Breadcrumbs', command: 'workbench.action.toggleBreadcrumbs', action: () => { uiStore.toggleBreadcrumbs(); closeAll(); }, checked: isBreadcrumbsChecked },
        { label: 'Sticky Scroll', command: 'workbench.action.toggleStickyScroll', action: () => { uiStore.toggleStickyScroll(); closeAll(); }, checked: isStickyScrollChecked, sep: true },
        { label: 'Status Bar', command: 'workbench.action.toggleStatusbarVisibility', action: () => { uiStore.toggleStatusBar(); closeAll(); }, checked: isStatusBarChecked }
      ]
    }
  ];

  // Reactive view of the registry — when extensions add menus, this updates.
  let registryVersion = $state(0);

  // Register menu items for discovery.
  onMount(() => {
    registryVersion++; // trigger initial read
    const flat: any[] = [];
    for (const menu of menus) {
      const menuId = `menubar/${menu.label.toLowerCase()}`;
      for (const item of menu.items as any[]) {
        flat.push({
          id: `${menuId}/${item.label}`,
          menuId,
          label: item.label,
          command: item.command,
          shortcut: item.shortcut,
          disabled: item.disabled,
          checked: item.checked,
          separator: item.sep,
          action: item.action,
          group: item.label.includes('New') ? 'new' : undefined
        });
      }
    }
    const d = menuRegistry.registerAll(flat);
    registryVersion++; // Force update to ensure displayMenus catches the new items
    return () => d.dispose();
  });

  $effect(() => {
    const d = menuRegistry.onDidChange(() => registryVersion++);
    return () => d.dispose();
  });

  let displayMenus = $derived.by(() => {
    void registryVersion;
    const reg = menuRegistry.getMenubarMenus();
    if (reg.size === 0) return menus;
    return [...reg.entries()].map(([label, items]) => ({
      label,
      items: items.map((i: any) => ({
        label: i.label,
        command: i.command,
        shortcut: i.shortcut,
        disabled: i.disabled,
        checked: i.checked,
        sep: i.separator,
        action: i.action
      }))
    }));
    registryVersion++; // refresh the reactive view
  });
</script>

<svelte:window onclick={closeAll} />

<div class="flex items-center text-xs h-full ml-2 space-x-1">
  {#each displayMenus as menu (menu.label)}
    <div class="relative">
      <button
        class="px-2 py-1 rounded outline-none select-none hover:bg-hover hover:text-primary"
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
          class="absolute top-full left-0 min-w-[240px] z-[100] nt-menu-panel"
          onclick={(e) => { e.stopPropagation(); closeAll(); }}
          onkeydown={(e) => { if (e.key === 'Escape') closeAll(); }}
        >
          {#each menu.items as item}
              <button
                class="nt-menu-item justify-between {!(item as any).disabled?.() ? 'hover:bg-selected focus:bg-selected text-secondary hover:text-primary' : 'text-muted'}"
                disabled={(item as any).disabled?.()}
                onclick={() => {
                  if ((item as any).disabled?.()) return;
                  const cmd = (item as any).command;
                  if (cmd && commandRegistry.has(cmd)) { void commandRegistry.execute(cmd); closeAll(); }
                  else (item as any).action();
                }}
                onmouseenter={(e) => (e.target as HTMLElement).focus()}
              >
                <div class="flex items-center">
                  <div class="w-4 mr-2 flex justify-center items-center">
                    {#if (item as any).checked?.()}<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>{/if}
                  </div>
                  {(item as any).label}
                </div>
                {#if (item as any).shortcut}
                  <span class="ml-4 text-[length:var(--nt-chrome-font-tip)] text-muted opacity-80">{(item as any).shortcut}</span>
                {/if}
              </button>
            {#if (item as any).sep}
              <div class="nt-menu-separator"></div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>
