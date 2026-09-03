<!-- svelte-ignore state_referenced_locally -->
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { uiStore } from '../../stores/ui';
  
  let { initialName, node, depth }: { initialName: string; node: any; depth: number } = $props();
  let val = $state(initialName);
  let inputEl: HTMLInputElement | undefined = $state();
  
  $effect(() => {
    if (inputEl) {
      inputEl.focus();
      if (!node.is_dir) {
        const lastDot = initialName.lastIndexOf('.');
        if (lastDot > 0) inputEl.setSelectionRange(0, lastDot);
        else inputEl.select();
      } else inputEl.select();
    }
  });

  async function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') uiStore.setRenamingItem(null);
    if (e.key === 'Enter' && val.trim().length > 0 && val !== initialName) {
      try {
        const sep = node.path.includes('\\') ? '\\' : '/';
        const parts = node.path.split(sep); parts.pop();
        const newPath = [...parts, val.trim()].join(sep);
        await uiStore.withStatus(`Renaming to ${val.trim()}...`, invoke('rename_item', { oldPath: node.path, newPath }), 500);
        uiStore.triggerExplorerRefresh();
        uiStore.setRenamingItem(null);
      } catch (err) { alert(err); }
    } else if (e.key === 'Enter' && val === initialName) {
      uiStore.setRenamingItem(null);
    }
  }
</script>

<div class="flex items-center gap-1.5 px-2 py-1 w-full text-primary" style="padding-left: {depth * 12 + 8}px">
  <span class="w-3.5 shrink-0 inline-block"></span>
  <span class="shrink-0 text-accent">
    {#if node.is_dir}
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
    {:else}
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
    {/if}
  </span>
  <input bind:this={inputEl} bind:value={val} onkeydown={handleKeydown} onblur={() => uiStore.setRenamingItem(null)} class="flex-1 border outline-none text-xs px-1 py-0.5 rounded-sm bg-canvas border-focus text-primary" />
</div>
