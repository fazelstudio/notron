<!--
 * Command Palette
 *
 * Quick-open and command execution overlay.
-->

<script lang="ts">
  import { paletteStore, type PaletteItem } from '../../stores/palette';
  import { settingsStore } from '../../stores/settings.svelte';
  import { getIconProvider } from '../../icon-theme/registry';
  import { Command as CmdIcon, FileText } from 'lucide-svelte';

  function paletteFileIconSvg(name: string, size = 16): string {
    try {
      const theme = settingsStore.effectiveSettings.icon_theme;
      if (theme === 'off') return '';
      const provider: any = getIconProvider(theme);
      if (provider?.getFileIconSvg) {
        const svg = provider?.getFileIconSvg?.(name, size) as string | undefined;
        if (svg) return svg;
      }
    } catch {}
    return '';
  }

  let { isOpen, onClose, initialQuery = '' }: { isOpen: boolean; onClose: () => void; initialQuery?: string } = $props();

  let query = $state('');
  let selectedIndex = $state(0);
  let inputEl: HTMLInputElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();
  
  let isCommandMode = $derived(query.startsWith('>'));
  let actualQuery = $derived(isCommandMode ? query.slice(1).trim() : query.trim());
  let placeholder = $derived(isCommandMode ? 'Type a command to run' : 'Type the name of a file to open quickly');

  let filteredItems = $derived.by(() => {
    if (!$paletteStore.isLoaded) return [];

    let pool = $paletteStore.items.filter((i: any) => isCommandMode ? i.category === 'command' : i.category !== 'command');

    if (!actualQuery) return pool.slice(0, 20);
    if (!$paletteStore.fzfInstance) return [];

    const results = $paletteStore.fzfInstance.find(actualQuery);
    return results
      .map((r: any) => r.item)
      .filter((item: any) => isCommandMode ? item.category === 'command' : item.category !== 'command')
      .slice(0, 20);
  });

  function handleSelect(item: PaletteItem) {
    item.action();
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      if (filteredItems.length === 0) return;
      selectedIndex = (selectedIndex + 1) % filteredItems.length;
      scrollSelectedIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (filteredItems.length === 0) return;
      selectedIndex = (selectedIndex - 1 + filteredItems.length) % filteredItems.length;
      scrollSelectedIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (filteredItems[selectedIndex]) handleSelect(filteredItems[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }

  function scrollSelectedIntoView() {
    if (!listEl) return;
    requestAnimationFrame(() => {
      const selected = listEl?.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null;
      selected?.scrollIntoView({ block: 'nearest' });
    });
  }

  $effect(() => {
    if (isOpen) {
      query = initialQuery;
      selectedIndex = 0;
      requestAnimationFrame(() => {
        inputEl?.focus();
        inputEl?.select();
      });
    }
  });

  // Reset selection when filter changes (typing or mode switch)
  $effect(() => {
    void filteredItems;
    // track query via filteredItems derivation already, but ensure index resets on mode switch / query change
    // Use untrack to avoid loop, but we simply reset when actualQuery changes
    selectedIndex = 0;
  });

  function clearQuery() {
    query = isCommandMode ? '>' : '';
    selectedIndex = 0;
    requestAnimationFrame(() => inputEl?.focus());
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- Backdrop: click outside to close, subtle dim -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[199] bg-black/15"
    onclick={onClose}
    onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
  ></div>

  <!-- Dropdown anchored to titlebar center, width matches trigger label -->
  <div
    tabindex="-1"
    class="fixed z-[200] top-9 left-1/2 -translate-x-1/2
           w-[clamp(360px,38vw,620px)] max-w-[calc(100vw-280px)]
           border flex flex-col overflow-hidden nt-dialog-panel"
    style="max-height: min(70vh, 520px); box-shadow: var(--nt-overlay-shadow);"
    role="dialog"
    aria-modal="true"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
  >
    <div class="flex items-center gap-2 px-2 h-[var(--nt-control-height)] shrink-0 border-b bg-[var(--nt-overlay-bg)] border-[var(--nt-overlay-border)]">
      <span class="shrink-0 text-muted flex items-center justify-center w-5">
        {#if isCommandMode}
          <!-- Chevron / command indicator -->
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  {/if}
                </span>
      <input
        bind:this={inputEl}
        class="flex-1 bg-transparent border-none outline-none text-[13px] leading-none text-primary placeholder-muted caret-primary"
        placeholder={placeholder}
        bind:value={query}
        oninput={() => { selectedIndex = 0; }}
        onkeydown={handleKeydown}
        spellcheck={false}
        autocomplete="off"
      />
      {#if query}
        <button
          aria-label="Clear"
          class="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-hover text-muted hover:text-primary"
          onclick={clearQuery}
          tabindex={-1}
            >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      {:else}
        <span class="hidden sm:inline-flex shrink-0 text-[10px] leading-none px-1.5 py-1 rounded border bg-input border-subtle text-muted">
          {isCommandMode ? 'Ctrl+Shift+P' : 'Ctrl+P'}
        </span>
      {/if}
                </div>

    <!-- List -->
            <div
      bind:this={listEl}
      class="overflow-y-auto overflow-x-hidden py-1 flex flex-col hover-scrollbar"
      style="max-height: 380px;"
      role="listbox"
    >
      {#if !$paletteStore.isLoaded}
        <div class="px-3 py-6 text-sm text-center text-muted flex flex-col items-center justify-center gap-2">
          <span class="inline-block w-4 h-4 rounded-full border-2 border-muted border-t-transparent animate-spin"></span>
          <span class="text-xs">Loading workspace files…</span>
        </div>
      {:else if filteredItems.length === 0}
        <div class="px-3 py-6 text-sm text-center text-muted flex flex-col items-center gap-1.5">
          <span class="text-xs font-medium">No {isCommandMode ? 'commands' : 'files'} found</span>
          <span class="text-[11px] opacity-70">
            {#if isCommandMode}
              Try typing a different command
            {:else}
              No matching files — type <span class="font-mono px-1 py-0.5 rounded bg-input border border-subtle text-[10px]">&gt;</span> to search commands
            {/if}
          </span>
        </div>
      {:else}
        {#each filteredItems as item, i (item.id)}
          {@const isSelected = i === selectedIndex}
          {@const isFile = item.category === 'file'}
          <div
              role="option"
            tabindex={-1}
            aria-selected={isSelected}
            data-index={i}
            class="flex items-center justify-between gap-3 px-2 mx-1 rounded-[2px] select-none nt-menu-item"
            class:bg-selected={isSelected}
            class:text-on-accent={isSelected}
            class:text-primary={!isSelected}
            onclick={() => handleSelect(item)}
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSelect(item); } }}
              onmouseenter={() => selectedIndex = i}
          >
            <div class="flex items-center gap-2.5 overflow-hidden min-w-0 flex-1">
              <span class="shrink-0 flex items-center justify-center w-[18px] h-[18px] {isSelected ? 'text-on-accent' : 'text-muted'}">
                {#if isFile}
              <span class="shrink-0 inline-flex items-center justify-center" style="width:16px;height:16px;" aria-hidden="true">
                    {@html paletteFileIconSvg(item.label, 16)}
                  </span>
                {:else if item.category === 'recent'}
                  <FileText size={14} />
                {:else}
                  <CmdIcon size={13} />
                {/if}
              </span>
              <span class="truncate min-w-0 flex-1 text-[13px] leading-4 {isSelected ? 'text-on-accent' : 'text-primary'}">{item.label}</span>
            </div>
            {#if item.shortcut}
              <kbd class="hidden sm:inline-flex shrink-0 text-[11px] leading-none px-1.5 py-1 rounded border {isSelected ? 'bg-white/15 border-white/20 text-on-accent' : 'bg-input border-subtle text-muted'}">{item.shortcut}</kbd>
            {/if}
          </div>
          {/each}
        <div class="h-1 shrink-0"></div>
      {/if}
    </div>

    <!-- Footer hint -->
    <div class="hidden sm:flex items-center justify-between px-3 h-7 shrink-0 border-t border-subtle bg-input text-[11px] text-muted">
      <span class="flex items-center gap-2">
        <span class="flex items-center gap-1"><kbd class="px-1 py-0.5 rounded bg-elevated border border-subtle text-[10px]">↑↓</kbd> navigate</span>
        <span class="flex items-center gap-1"><kbd class="px-1 py-0.5 rounded bg-elevated border border-subtle text-[10px]">↵</kbd> open</span>
        <span class="flex items-center gap-1"><kbd class="px-1 py-0.5 rounded bg-elevated border border-subtle text-[10px]">esc</kbd> close</span>
      </span>
      <span class="opacity-60">
        {#if isCommandMode}
          {filteredItems.length} commands
        {:else}
          {filteredItems.length} files
        {/if}
      </span>
    </div>
  </div>
{/if}

<style>
  .hover-scrollbar::-webkit-scrollbar-thumb { background: transparent; }
  .hover-scrollbar:hover::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); }
</style>
