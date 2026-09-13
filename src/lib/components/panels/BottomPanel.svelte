<script lang="ts">
/**
 * BottomPanel
 *
 * Bottom panel host: terminal, output, problems and extension panels
 * contributed through the bottom panel registry.
 */
  import { untrack } from 'svelte';
  import { terminalStore, type TerminalType } from '../../stores/terminal';
  import { uiStore } from '../../stores/ui';
  import { getPlatformShells } from '../../utils/platform';
  import { SHELL_DISPLAY_NAMES } from '../../constants';
  import TerminalInstance from './TerminalInstance.svelte';
  import Tooltip from '../common/Tooltip.svelte';
  import ViewTitleMenu from '../common/ViewTitleMenu.svelte';
  import { bottomPanelRegistry } from '../../workbench/bottomPanelRegistry';
  import { commandRegistry } from '../../commands/registry';
  import { eventBus } from '../../utils/eventBus';
  import DropdownMenu from '../common/DropdownMenu.svelte';
  const termStore = terminalStore;
  
  let isDropdownOpen = $state(false);
  let outputSearch = $state('');
  let outputCategory = $state('Git');

  let outputContainer = $state<HTMLDivElement | null>(null);
  let componentVersion = $state(0);
  let isAtBottom = $state(true);

  function onOutputScroll() {
    if (!outputContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = outputContainer;
    isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;
  }

  let logsLength = $derived(outputCategory === 'Git' ? $termStore.outputLogs.length : 0);
  $effect(() => {
    logsLength;
    if (isAtBottom && outputContainer) {
      setTimeout(() => {
        if (outputContainer) {
          outputContainer.scrollTop = outputContainer.scrollHeight;
        }
      }, 0);
    }
  });

  const outputCategoryItems = [
    { label: 'Git', action: () => outputCategory = 'Git' },
    { label: 'Window', action: () => outputCategory = 'Window' },
    { label: 'Extension Host', action: () => outputCategory = 'Extension Host' },
    { label: 'ESLint', action: () => outputCategory = 'ESLint' }
  ];

  async function openProblem(filePath: string, line: number, col: number) {
    try {
      const root = uiStore.getSnapshot().explorerRoot || '';
      const fullPath = `${root}\\${filePath.replace(/\//g, '\\')}`;

      eventBus.emit('request-open-file', { path: fullPath });

      setTimeout(() => {
        eventBus.emit('editor:action', { action: 'goto', line, column: col, endColumn: col });
      }, 50);
    } catch (err) {
      console.error("Failed to open problem file", err);
    }
  }

  $effect(() => {
    if ($termStore.activePanel === 'terminal' && $termStore.isVisible && $termStore.terminals.length === 0) {
      untrack(() => createTerminal());
    }
  });

  function createTerminal(type?: TerminalType) {
    void type;
    void commandRegistry.execute('workbench.action.terminal.new');
    isDropdownOpen = false;
  }

  $effect(() => {
    const d = bottomPanelRegistry.onDidChange(() => {
      componentVersion++;
    });
    return () => d.dispose();
  });

  let visiblePanels = $derived.by(() => {
    void componentVersion;
    const visible = bottomPanelRegistry.getVisible();
    // Fallback to defaults if registry not yet populated (prevents empty header flash)
    if (visible.length === 0) {
      const all = bottomPanelRegistry.getAll();
      return all.length > 0 ? all : visible;
    }
    return visible;
  });

  // Ensure activePanel is always a visible panel — fallback to first visible if stale
  $effect(() => {
    const panels = visiblePanels;
    const active = $termStore.activePanel;
    if (panels.length > 0 && !panels.some((p) => p.id === active)) {
      untrack(() => terminalStore.setActivePanelSilently?.(panels[0].id as any) ?? terminalStore.setActivePanel(panels[0].id as any));
    }
  });

  function handleTabClick(panelId: string) {
    // Core panels go through commands for modularity; extension panels fallback to store
    if (panelId === 'terminal') void commandRegistry.execute('workbench.action.terminal.show');
    else if (panelId === 'output') void commandRegistry.execute('workbench.actions.view.output');
    else if (panelId === 'problems') void commandRegistry.execute('workbench.actions.view.problems');
    else terminalStore.setActivePanel(panelId as any);
  }
</script>

<div
  class="flex flex-col border-t transition-all z-40 relative bg-[var(--nt-panel-bg)] border-[var(--nt-panel-border)]"
  class:hidden={!$termStore.isVisible}
  class:flex-1={$termStore.isMaximized}
  style="{$termStore.isMaximized ? '' : `height: ${$termStore.height}px`};"
>
    {#if !$termStore.isMaximized}
      <div 
        role="presentation"
        class="absolute top-0 left-0 right-0 h-1 -mt-0.5 cursor-ns-resize hover:bg-indicator-active z-50 transition-colors"
    onmousedown={(e) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = $termStore.height;
      function onMouseMove(me: MouseEvent) {
        if (!$termStore.isResizing) return;
        const delta = startY - me.clientY;
        terminalStore.setHeight(Math.max(100, Math.min(window.innerHeight - 100, startHeight + delta)));
      }
      function onMouseUp() {
        terminalStore.setResizing(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }}
      ></div>
    {/if}

  <div class="flex items-center justify-between h-9 px-4 border-b shrink-0 select-none bg-[var(--nt-panel-bg)] border-[var(--nt-panel-border)]">
      <div class="flex items-center gap-4 h-full">
      {#each visiblePanels as item (item.id)}
        <button 
          class="h-full text-xs font-semibold uppercase tracking-widest flex items-center border-b-2 transition-colors { $termStore.activePanel === item.id ? 'text-primary border-accent' : 'text-secondary border-transparent hover:text-primary' }"
          onclick={() => handleTabClick(item.id)}
        >
          {item.label}
          {#if item.badge}
            {@const badge = item.badge()}
            {#if badge}
              <span class="ml-1.5 flex items-center justify-center rounded-full bg-panel border border-subtle w-4 h-4 text-[10px]">{badge}</span>
            {/if}
          {/if}
        </button>
      {/each}
        </div>
      <div class="flex items-center gap-1 text-icon-default relative">
        {#if $termStore.activePanel === 'terminal'}
        <div class="relative">
          <Tooltip content="New Terminal" side="top">
            <button 
              aria-label="New Terminal" 
              onclick={() => isDropdownOpen = !isDropdownOpen} 
              class="p-1 rounded hover:bg-hover hover:text-icon-active transition-colors flex items-center gap-0.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </Tooltip>
          
          {#if isDropdownOpen}
            <div
              class="fixed inset-0 z-[99]"
              role="presentation"
              onclick={() => isDropdownOpen = false}
              oncontextmenu={(e) => { e.preventDefault(); isDropdownOpen = false; }}
              onkeydown={(e) => { if (e.key === 'Escape') isDropdownOpen = false; }}
            ></div>
            <div 
              class="absolute top-full right-0 mt-1 min-w-[160px] rounded-md border p-1 shadow-elevated z-[100] animate-in fade-in duration-100 bg-panel border-subtle text-primary flex flex-col"
            >
              {#each getPlatformShells() as shellType (shellType)}
                <button
                  class="flex items-center justify-between w-full px-2 py-1.5 text-xs rounded-sm cursor-pointer select-none outline-none transition-colors hover:bg-selected focus:bg-selected hover:text-primary focus:text-primary text-secondary"
                  onclick={() => createTerminal(shellType)}
                >
                  <span>{SHELL_DISPLAY_NAMES[shellType]}</span>
                </button>
              {/each}
            </div>
          {/if}
        
        <Tooltip content="Kill Terminal" side="top">
          <button 
            aria-label="Delete Active Terminal" 
            onclick={() => commandRegistry.execute('workbench.action.terminal.killActive')} 
            class="p-1 rounded hover:bg-hover hover:text-error transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/></svg>
          </button>        </Tooltip>
          </div>
          {/if}
          
          {#if $termStore.activePanel === 'output'}
        <div class="relative flex items-center h-full mr-2">
          <input type="text" placeholder="Filter" class="bg-panel border border-subtle text-[11px] pl-6 pr-2 py-0.5 rounded w-40 text-primary outline-none placeholder-muted" bind:value={outputSearch} />
          <svg class="absolute left-1.5 top-1.5 w-3 h-3 text-muted" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </div>
        {#snippet categoryTrigger()}
          <button class="flex items-center gap-1 px-1.5 py-0.5 hover:bg-hover rounded text-[11px] text-secondary hover:text-primary transition-colors h-full">
            {outputCategory}
            <svg class="w-3 h-3 opacity-70" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        {/snippet}
        <DropdownMenu items={outputCategoryItems} trigger={categoryTrigger} align="right" />
        
        <div class="w-px h-4 bg-subtle mx-1"></div>

        <Tooltip content="Clear Output" side="top">
          <button 
            aria-label="Clear Output" 
            onclick={() => commandRegistry.execute('workbench.action.terminal.clear')} 
            class="p-1 rounded hover:bg-hover hover:text-icon-active transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </button>
        </Tooltip>
        {/if}
        
        <Tooltip content="Maximize Panel" side="top">
          <button 
            aria-label="Maximize Terminal" 
            onclick={() => commandRegistry.execute('workbench.action.terminal.maximize')} 
            class="p-1 rounded hover:bg-hover hover:text-icon-active transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              {#if $termStore.isMaximized}
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              {:else}
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              {/if}
            </svg>
          </button>
        </Tooltip>
        
        <Tooltip content="Hide Terminal" side="top">
          <button 
            aria-label="Close Terminal Panel" 
            onclick={() => commandRegistry.execute('workbench.action.terminal.hide')} 
            class="p-1 rounded hover:bg-hover hover:text-icon-active transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </Tooltip>
        <ViewTitleMenu menuId={`panel/${$termStore.activePanel}/title`} />
        </div>
    </div>

  <!-- Body — core panels render inline; extension panels render via registry loadComponent -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Terminal Panel -->
      <div class="flex-1 flex overflow-hidden" class:hidden={$termStore.activePanel !== 'terminal'}>
      <!-- Active Terminal Content -->
      <div class="flex-1 overflow-hidden relative">
        {#if $termStore.terminals.length === 0}
          <div class="absolute inset-0 flex flex-col items-center justify-center text-muted gap-4">
            <span class="text-sm">No Active Terminals</span>
            <button class="px-4 py-2 bg-accent text-on-accent rounded-md hover:brightness-110 transition-all text-xs" onclick={() => commandRegistry.execute('workbench.action.terminal.new')}>New Terminal</button>
          </div>
        {/if}
        {#each $termStore.terminals as term (term.id)}
          <div 
            class="absolute inset-0 transition-opacity" 
            class:opacity-100={$termStore.activeTerminalId === term.id} 
            class:opacity-0={$termStore.activeTerminalId !== term.id} 
            class:pointer-events-none={$termStore.activeTerminalId !== term.id}
            class:z-10={$termStore.activeTerminalId === term.id}
            class:-z-10={$termStore.activeTerminalId !== term.id}
          >
            <TerminalInstance tabId={term.id} type={term.type} cwd={term.cwd} initialCommand={term.initialCommand} env={term.env} />
          </div>
        {/each}
      </div>

      <!-- Sidebar -->
      {#if $termStore.terminals.length > 1}
        <div class="w-48 border-l border-subtle bg-panel flex flex-col overflow-y-auto shrink-0">
          {#each $termStore.terminals as term (term.id)}
            <button 
              class="px-3 py-2 text-xs text-left truncate transition-colors flex items-center justify-between group"
              class:bg-selected={$termStore.activeTerminalId === term.id}
              class:text-primary={$termStore.activeTerminalId === term.id}
              class:text-secondary={$termStore.activeTerminalId !== term.id}
              class:hover:bg-hover={$termStore.activeTerminalId !== term.id}
              onclick={() => { terminalStore.setActive(term.id); }}
            >
              <span class="truncate flex-1 pr-2">{term.name}</span>
              <div 
                role="button"
                tabindex="0"
                class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-error hover:text-on-accent transition-all text-icon-default"
                onclick={(e) => { e.stopPropagation(); terminalStore.closeTerminal(term.id); }}
                onkeydown={(e) => { if (e.key === 'Enter') terminalStore.closeTerminal(term.id); }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/></svg>
              </div>
            </button>
          {/each}
        </div>
      {/if}
      </div>

      <!-- Output Panel -->
      <div class="flex-1 flex flex-col overflow-hidden" class:hidden={$termStore.activePanel !== 'output'}>
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div bind:this={outputContainer} onscroll={onOutputScroll} tabindex="0" onpaste={(e) => e.preventDefault()} class="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-secondary whitespace-pre-wrap select-text selectable overscroll-none">
            {#each (outputCategory === 'Git' ? $termStore.outputLogs : []).filter(log => !outputSearch || log.toLowerCase().includes(outputSearch.toLowerCase())) as log}
              <div class="mb-1 selectable">{log}</div>
            {/each}
            {#if (outputCategory === 'Git' ? $termStore.outputLogs : []).length === 0}
              <div class="text-muted italic selectable">No output to display.</div>
            {/if}
          </div>
        </div>

      <!-- Problems Panel -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div tabindex="0" onpaste={(e) => e.preventDefault()} class="flex-1 overflow-y-auto font-mono text-[11px] text-secondary select-text selectable overscroll-none py-2" class:hidden={$termStore.activePanel !== 'problems'}>
          <!-- Dummy Data matching the reference image -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="flex items-center gap-1.5 px-4 py-1 hover:bg-hover cursor-pointer" onclick={() => openProblem('src/App.svelte', 1, 1)}>
            <svg class="w-3.5 h-3.5 text-secondary rotate-90" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            <span class="text-warning font-bold font-sans">S</span>
            <span class="text-primary">App.svelte</span>
            <span class="text-muted">src</span>
            <span class="text-muted flex items-center justify-center rounded-full border border-subtle w-4 h-4 text-[9px] ml-1">3</span>
          </div>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="flex items-center gap-2 px-8 py-1 hover:bg-hover cursor-pointer" onclick={() => openProblem('src/App.svelte', 1590, 50)}>
            <svg class="w-3.5 h-3.5 text-warning shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <span class="truncate">The class <code class="text-primary font-bold min-w-0">`min-w-[200px]`</code> can be written as <code class="text-primary font-bold min-w-0">`min-w-50`</code> <span class="text-muted">tailwindcss(suggestCanonicalClasses)</span> <span class="text-muted">[Ln 1590, Col 50]</span></span>
          </div>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="flex items-center gap-2 px-8 py-1 hover:bg-hover cursor-pointer" onclick={() => openProblem('src/App.svelte', 1649, 18)}>
            <svg class="w-3.5 h-3.5 text-warning shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <span class="truncate">The class <code class="text-primary font-bold min-w-0">`min-w-[160px]`</code> can be written as <code class="text-primary font-bold min-w-0">`min-w-40`</code> <span class="text-muted">tailwindcss(suggestCanonicalClasses)</span> <span class="text-muted">[Ln 1649, Col 18]</span></span>
          </div>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="flex items-center gap-2 px-8 py-1 hover:bg-hover cursor-pointer" onclick={() => openProblem('src/App.svelte', 1649, 64)}>
            <svg class="w-3.5 h-3.5 text-warning shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <span class="truncate">The class <code class="text-primary font-bold min-w-0">`z-[100]`</code> can be written as <code class="text-primary font-bold min-w-0">`z-100`</code> <span class="text-muted">tailwindcss(suggestCanonicalClasses)</span> <span class="text-muted">[Ln 1649, Col 64]</span></span>
          </div>

          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="flex items-center gap-1.5 px-4 py-1 hover:bg-hover cursor-pointer mt-1" onclick={() => openProblem('src/lib/components/SearchPanel.svelte', 1, 1)}>
            <svg class="w-3.5 h-3.5 text-secondary rotate-90" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            <span class="text-warning font-bold font-sans">S</span>
            <span class="text-primary">SearchPanel.svelte</span>
            <span class="text-muted">src\lib\components</span>
            <span class="text-muted flex items-center justify-center rounded-full border border-subtle w-4 h-4 text-[9px] ml-1">4</span>
          </div>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="flex items-center gap-2 px-8 py-1 hover:bg-hover cursor-pointer" onclick={() => openProblem('src/lib/components/SearchPanel.svelte', 423, 64)}>
            <svg class="w-3.5 h-3.5 text-warning shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <span class="truncate">The class <code class="text-primary font-bold min-w-0">`py-[3px]`</code> can be written as <code class="text-primary font-bold min-w-0">`py-0.75`</code> <span class="text-muted">tailwindcss(suggestCanonicalClasses)</span> <span class="text-muted">[Ln 423, Col 64]</span></span>
          </div>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="flex items-center gap-2 px-8 py-1 hover:bg-hover cursor-pointer" onclick={() => openProblem('src/lib/components/SearchPanel.svelte', 425, 93)}>
            <svg class="w-3.5 h-3.5 text-warning shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <span class="truncate">The class <code class="text-primary font-bold min-w-0">`mt-[1px]`</code> can be written as <code class="text-primary font-bold min-w-0">`mt-px`</code> <span class="text-muted">tailwindcss(suggestCanonicalClasses)</span> <span class="text-muted">[Ln 425, Col 93]</span></span>
          </div>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="flex items-center gap-2 px-8 py-1 hover:bg-hover cursor-pointer" onclick={() => openProblem('src/lib/components/SearchPanel.svelte', 428, 82)}>
            <svg class="w-3.5 h-3.5 text-warning shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <span class="truncate">The class <code class="text-primary font-bold min-w-0">`rounded-[2px]`</code> can be written as <code class="text-primary font-bold min-w-0">`rounded-xs`</code> <span class="text-muted">tailwindcss(suggestCanonicalClasses)</span> <span class="text-muted">[Ln 428, Col 82]</span></span>
          </div>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="flex items-center gap-2 px-8 py-1 hover:bg-hover cursor-pointer" onclick={() => openProblem('src/lib/components/SearchPanel.svelte', 428, 96)}>
            <svg class="w-3.5 h-3.5 text-warning shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <span class="truncate">The class <code class="text-primary font-bold min-w-0">`px-[1px]`</code> can be written as <code class="text-primary font-bold min-w-0">`px-px`</code> <span class="text-muted">tailwindcss(suggestCanonicalClasses)</span> <span class="text-muted">[Ln 428, Col 96]</span></span>
          </div>
        </div>

      <!-- Extension-contributed panels (dynamic via loadComponent) -->
      {#each visiblePanels.filter(p => !['terminal','output','problems'].includes(p.id) && p.loadComponent) as item (item.id)}
        <div class="flex-1 flex overflow-hidden" class:hidden={$termStore.activePanel !== item.id}>
          {#await item.loadComponent!() then module}
            {@const Component = module.default ?? module}
            {#if Component}
              <div class="flex-1 flex overflow-hidden">
                <Component />
              </div>
            {/if}
          {/await}
        </div>
      {/each}
    </div>
</div>
