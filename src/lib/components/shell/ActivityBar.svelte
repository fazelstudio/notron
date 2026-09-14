<script lang="ts">
/**
 * Activity Bar
 *
 * Renders activity bar items from the registry.
 */
  import { uiStore } from '../../stores/ui';
  import { gitRepoStore } from '../../stores/gitRepo';
  import { activityBarRegistry, type ActivityBarItem } from '../../workbench/activityBarRegistry';
  import { commandRegistry } from '../../commands/registry';
  import Tooltip from '../common/Tooltip.svelte';
  import { TOOLTIP_SHOW_DELAY_MS } from '../../constants';

  interface Props {
    onOpenSettings?: () => void;
  }

  let { onOpenSettings }: Props = $props();

  let ui = $derived($uiStore);
  let gitState = $derived($gitRepoStore);
  let version = $state(0);

  $effect(() => {
    const d = activityBarRegistry.onDidChange(() => version++);
    return () => d.dispose();
  });

  let items = $derived.by(() => {
    void version;
    void ui.activeSidebarPanel;
    void ui.isSidebarOpen;
    void gitState.repo;
    void gitState.repoLoading;
    void gitState.syncing;
    void gitState.availabilityLoading;
    return activityBarRegistry.getVisible();
  });

  function handleClick(item: ActivityBarItem) {
    // Route through command registry — view commands own the sidebar logic.
    const cmdMap: Record<string, string> = {
      explorer: 'workbench.view.explorer',
      search: 'workbench.view.search',
      git: 'workbench.view.scm',
      run: 'workbench.view.debug'
    };
    const cmd = cmdMap[item.viewId];
    if (cmd && commandRegistry.has(cmd)) {
      // Toggle behavior: if already active, collapse sidebar.
      if (ui.isSidebarOpen && ui.activeSidebarPanel === item.viewId) {
        void commandRegistry.execute('workbench.action.toggleSidebarVisibility');
      } else {
        void commandRegistry.execute(cmd);
      }
    } else {
      if (ui.isSidebarOpen && ui.activeSidebarPanel === item.viewId) uiStore.setSidebarOpen(false);
      else { uiStore.setActiveSidebarPanel(item.viewId as any); uiStore.setSidebarOpen(true); }
    }
  }

  function isActive(item: ActivityBarItem): boolean {
    return ui.activeSidebarPanel === item.viewId && ui.isSidebarOpen;
  }
</script>

<div class="w-12 flex flex-col items-center py-0 justify-between z-10 border-r bg-[var(--nt-activitybar-bg)] border-[var(--nt-activitybar-border)]">
  <div class="flex flex-col items-center gap-1 w-full mt-2">
    {#each items as item (item.id)}
      {@const active = isActive(item)}
      {@const isGit = item.id === 'git'}
      {@const badgeLoading = isGit ? (gitState.repoLoading || gitState.syncing || gitState.availabilityLoading) : (item.getBadgeLoading?.() ?? false)}
      {@const badgeText = isGit ? (() => {
        if (badgeLoading) return null;
        const repo: any = gitState.repo;
        if (!repo) return null;
        const unstaged = (repo.unstaged?.length ?? 0) + (repo.untracked?.length ?? 0);
        const count = (repo.staged?.length ?? 0) + unstaged + (repo.conflicted?.length ?? 0);
        return count === 0 ? null : count > 99 ? '99+' : String(count);
      })() : (item.getBadgeText?.() ?? null)}
      <Tooltip content={item.tooltip} side="right" hoverDelay={TOOLTIP_SHOW_DELAY_MS}>
        <button
          aria-label={item.label}
          onclick={() => handleClick(item)}
          class="p-1.5 bg-transparent relative hover:text-icon-active"
          class:text-icon-active-tab={active}
          class:text-icon-default={!active}
        >
          {#if active}
            <div class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-indicator-active"></div>
          {/if}

          {#if item.icon === 'explorer'}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          {:else if item.icon === 'search'}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          {:else if item.icon === 'git'}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M6 9v6"/><path d="M18 9v2a2 2 0 0 1-2 2h-4a2 2 0 0 0-2 2v6"/></svg>
          {:else if item.icon === 'run'}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 18 12 6 21 6 3"/></svg>
          {:else if item.icon === 'extensions'}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M12 8a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4z"/><path d="M20 12a8 8 0 0 1-8 8 8 8 0 0 1-8-8 8 8 0 0 1 8-8 8 8 0 0 1 8 8z"/></svg>
          {/if}

          {#if badgeLoading && active}
            <div class="absolute bottom-0 -right-1 bg-accent text-on-accent rounded-full h-4 min-w-4 flex items-center justify-center pointer-events-none" title="Git is analyzing...">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="animate-spin"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            </div>
          {:else if badgeText}
            <div class="absolute bottom-0 -right-1 bg-accent text-on-accent text-[9px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center pointer-events-none">
              {badgeText}
            </div>
          {/if}
        </button>
      </Tooltip>
    {/each}
  </div>

  <Tooltip content="Settings (Ctrl+,)" side="right" hoverDelay={TOOLTIP_SHOW_DELAY_MS}>
    <button
      aria-label="Settings"
      onclick={() => { if (commandRegistry.has('workbench.action.openSettings')) void commandRegistry.execute('workbench.action.openSettings'); else onOpenSettings?.(); }}
      class="p-1.5 bg-transparent mb-1 text-icon-default hover:text-icon-active"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
  </Tooltip>
</div>
