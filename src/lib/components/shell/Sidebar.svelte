<script lang="ts">
/**
 * Sidebar
 *
 * UI component..
 */
  /**
   * Sidebar
   *
   * Renders the active sidebar view. Title comes from the registry
   * so new views appear without editing this file.
   */
  import { uiStore } from '../../stores/ui';
  import { sidebarRegistry } from '../../workbench/sidebarRegistry';
  import { commandRegistry } from '../../commands/registry';
  import Tooltip from '../common/Tooltip.svelte';
  import ViewTitleMenu from '../common/ViewTitleMenu.svelte';
  import FileTree from '../explorer/FileTree.svelte';

  let { onOpenFolder, onOpenFile }: { onOpenFolder: () => void; onOpenFile: () => void } = $props();
  $effect(() => { void onOpenFolder; void onOpenFile; });
  const ui = uiStore;

  // Non-explorer views are resolved from the sidebar registry, so a new view.
  // (or a generic one like SCM) needs no change here.
  let registryVersion = $state(0);
  $effect(() => {
    const d = sidebarRegistry.onDidChange(() => registryVersion++);
    return () => d.dispose();
  });
  let activeView = $derived.by(() => {
    void registryVersion;
    return sidebarRegistry.get($ui.activeSidebarPanel);
  });

  function setSidebarWidth(w: number) {
    uiStore.setSidebarWidth(w);
  }

  let headerTitle = $derived(sidebarRegistry.get($ui.activeSidebarPanel)?.title ?? $ui.activeSidebarPanel);
</script>

{#if $ui.isSidebarOpen}
  <div style="width: {$ui.sidebarWidth}px" class="flex flex-col border-r z-50 relative shrink-0 bg-[var(--nt-sidebar-bg)] border-[var(--nt-sidebar-border)]">
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
        }
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      }}
    ></div>
    <div class="h-9 flex items-center justify-between px-4 text-xs font-semibold tracking-widest select-none uppercase text-secondary">
      <span>{headerTitle}</span>
      <div class="flex items-center gap-0.5">
      {#if $ui.activeSidebarPanel === 'explorer'}
        <Tooltip content="Toggle VCS/System Hidden Files (.git, .svn, …)">
          <button aria-label="Toggle Hidden VCS Files" onclick={() => commandRegistry.execute('explorer.toggleDotFiles')} class="p-1 rounded transition-colors hover:bg-hover" class:text-accent={$ui.showDotFiles} class:text-icon-default={!$ui.showDotFiles} class:hover:text-icon-active={true}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
          </button>
        </Tooltip>
      {:else if $ui.activeSidebarPanel === 'search'}
        {@const canSearchAction = $ui.searchQuery.length > 0 && $ui.searchResultCount > 0}
        <div class="flex items-center gap-0.5">
          <Tooltip content="Refresh">
            <button aria-label="Refresh" onclick={() => commandRegistry.execute('workbench.action.search.refresh')} class="p-1 rounded transition-colors hover:bg-hover text-icon-default" disabled={!canSearchAction} class:opacity-50={!canSearchAction} class:cursor-not-allowed={!canSearchAction} class:hover:text-icon-active={canSearchAction}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
          </Tooltip>
          <Tooltip content="Collapse All">
            <button aria-label="Collapse All" onclick={() => commandRegistry.execute('workbench.action.search.collapseAll')} class="p-1 rounded transition-colors hover:bg-hover text-icon-default" disabled={!canSearchAction} class:opacity-50={!canSearchAction} class:cursor-not-allowed={!canSearchAction} class:hover:text-icon-active={canSearchAction}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </button>
          </Tooltip>
        </div>
      {/if}
        {#if $ui.activeSidebarPanel !== 'explorer'}
          <ViewTitleMenu menuId={`view/${$ui.activeSidebarPanel}/title`} />
        {/if}
      </div>
    </div>
    <div class="flex-1 overflow-y-auto text-sm hover-scrollbar">
      {#if $ui.activeSidebarPanel === 'explorer'}
        <div class="flex flex-col h-full">
          {#if $ui.explorerRoot}
            <div class="flex flex-col h-full">
              <div class="group h-7 flex items-center justify-between px-4 border-b shrink-0 bg-[var(--nt-sidebar-header-bg)] border-[var(--nt-sidebar-border)]">
                <span class="text-[11px] font-semibold uppercase truncate pr-2 text-primary">
                  {$ui.explorerRoot.split(/[/\\]/).pop() || 'WORKSPACE'}
                </span>
                <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Tooltip content="New File">
                    <button aria-label="New File" onclick={(e) => { e.preventDefault(); e.stopPropagation(); void commandRegistry.execute('explorer.newFile'); }} class="p-1 rounded transition-colors hover:bg-hover text-icon-default hover:text-icon-active">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                    </button>
                  </Tooltip>
                  <Tooltip content="New Folder">
                    <button aria-label="New Folder" onclick={(e) => { e.preventDefault(); e.stopPropagation(); void commandRegistry.execute('explorer.newFolder'); }} class="p-1 rounded transition-colors hover:bg-hover text-icon-default hover:text-icon-active">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
                    </button>
                  </Tooltip>
                  <Tooltip content="Refresh Explorer">
                    <button aria-label="Refresh Explorer" onclick={() => commandRegistry.execute('workbench.action.explorer.refresh')} class="p-1 rounded transition-colors hover:bg-hover text-icon-default hover:text-icon-active">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    </button>
                  </Tooltip>
                  <Tooltip content="Collapse Explorer">
                    <button aria-label="Collapse Explorer" onclick={() => commandRegistry.execute('workbench.action.explorer.collapseAll')} class="p-1 rounded transition-colors hover:bg-hover text-icon-default hover:text-icon-active">
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
                <button onclick={() => commandRegistry.execute('workbench.action.files.openFolder')} class="text-xs py-1.5 px-3 rounded text-center w-full cursor-pointer transition-colors bg-accent hover:bg-accent-hover text-on-accent">Open Folder</button>
                <button onclick={() => commandRegistry.execute('workbench.action.files.openFile')} class="text-xs py-1.5 px-3 rounded text-center w-full cursor-pointer transition-colors bg-surface-2 hover:bg-hover text-primary">Open File</button>
              </div>
            </div>
          {/if}
        </div>
      {:else if activeView}
        {#await activeView.loadComponent() then module}
          {@const ViewComponent = module.default ?? module}
          {#if ViewComponent}
            <div class="flex flex-col h-full overflow-hidden">
              <ViewComponent />
            </div>
          {/if}
        {/await}
      {/if}
    </div>
  </div>
{/if}
