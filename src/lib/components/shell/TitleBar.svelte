<script lang="ts">
/**
 * Title Bar
 *
 * Window title bar with navigation, quick open, and window controls.
 */
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { uiStore } from '../../stores/ui';
  import { canGoBack, canGoForward } from '../../stores/navigation';
  import { commandRegistry } from '../../commands/registry';
  import TitleMenuBar from '../panels/TitleMenuBar.svelte';

  let { onQuickOpen }: { onQuickOpen: () => void } = $props();

  const ui = uiStore;

  let isMaximized = $state(false);

  $effect(() => {
    const appWindow = getCurrentWindow();
    const syncMaximized = () => appWindow.isMaximized().then((v) => { isMaximized = v; }).catch(() => {});
    syncMaximized();
    const unlisten = appWindow.onResized(syncMaximized);
    return () => { unlisten.then((fn) => fn()).catch(() => {}); };
  });
</script>

<div class="relative z-[100] h-9 flex items-center justify-between pl-2 select-none bg-[var(--nt-titlebar-bg)] text-[var(--nt-titlebar-fg)] border-b border-[var(--nt-titlebar-border)]" data-tauri-drag-region>
  <div class="flex items-center h-full shrink-0" data-tauri-drag-region="false">
    <img src="/notron.png" alt="Notron Logo" class="w-4 h-4 ml-1 pointer-events-none" />
    <TitleMenuBar />
  </div>

  <!-- Center: label is exactly centered; nav buttons are anchored to its left side -->
  <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center z-10" data-tauri-drag-region="false">
    <!-- Nav buttons are out-of-flow so the label stays perfectly centered -->
    <div class="absolute right-full mr-2 flex items-center gap-1">
      <button
        class="p-1 rounded hover:bg-hover text-icon-default hover:text-icon-active disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        onclick={() => commandRegistry.execute('workbench.action.navigateBack')}
        title="Go Back (Alt+LeftArrow)"
        disabled={!$canGoBack}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <button
        class="p-1 rounded hover:bg-hover text-icon-default hover:text-icon-active disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        onclick={() => commandRegistry.execute('workbench.action.navigateForward')}
        title="Go Forward (Alt+RightArrow)"
        disabled={!$canGoForward}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </div>

    <button
      id="quick-input-trigger"
      class="flex items-center gap-2 w-[clamp(360px,38vw,620px)] max-w-[calc(100vw-280px)] h-7 px-3 rounded-[2px] border bg-[var(--nt-overlay-bg)] hover:bg-[var(--nt-hover-bg)] text-xs border-[var(--nt-overlay-border)] text-[var(--nt-prim-fg-muted)] hover:text-[var(--nt-titlebar-fg)] min-w-0"
      onclick={onQuickOpen}
      title="Quick Open — Search files (Ctrl+P) — Type > for commands"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-60 shrink-0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <span class="truncate flex-1 text-left">{$ui.explorerRoot ? $ui.explorerRoot.split(/[/\\]/).pop() : 'Notron'}</span>
      <span class="hidden sm:inline-flex items-center gap-1 shrink-0 opacity-40 text-[10px] tracking-wide">
        <span class="hidden lg:inline">Ctrl+P</span>
        <span class="hidden lg:inline">·</span>
        <span class="hidden lg:inline">&gt; commands</span>
      </span>
    </button>
  </div>

  <div class="flex items-center justify-end h-full" data-tauri-drag-region="false">
    <button
      aria-label="Minimize"
      onclick={() => commandRegistry.execute('window.minimize')}
      class="w-[46px] h-full flex items-center justify-center text-icon-default hover:bg-hover hover:text-icon-active"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
    <button
      aria-label={isMaximized ? 'Restore' : 'Maximize'}
      onclick={() => commandRegistry.execute('window.maximize')}
      class="w-[46px] h-full flex items-center justify-center text-icon-default hover:bg-hover hover:text-icon-active"
    >
      {#if isMaximized}
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
      {/if}
    </button>
    <button
      aria-label="Close"
      onclick={() => commandRegistry.execute('window.close')}
      class="w-[46px] h-full flex items-center justify-center text-icon-default hover:bg-[var(--color-error)] hover:text-[var(--text-inverse)]"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
</div>