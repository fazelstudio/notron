<script lang="ts">
  import { fileService } from '../../services/fileService';
  import { uiStore } from '../../stores/ui';
  
  let { type, parentPath, depth = 0 }: { type: 'file' | 'folder'; parentPath: string; depth?: number } = $props();
  let val = $state('');
  let inputEl: HTMLInputElement | undefined = $state();
  
  $effect(() => {
    inputEl?.focus();
  });

  async function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') uiStore.setCreatingItem(null);
    if (e.key === 'Enter' && val.trim().length > 0) {
      try {
        const sep = parentPath.includes('\\') ? '\\' : '/';
        const fullPath = `${parentPath}${sep}${val.trim()}`;
        const invokePromise = type === 'folder' 
          ? fileService.createDirectory(fullPath)
          : fileService.createFile(fullPath);
        await uiStore.withStatus(`Creating ${val.trim()}...`, invokePromise, 500);
        uiStore.triggerExplorerRefresh();
        uiStore.setCreatingItem(null);
      } catch (err) { alert(err); }
    }
  }
</script>

<div class="flex items-center gap-1.5 pr-2 py-1 w-full text-primary border border-transparent" style="padding-left: {depth * 12 + 8}px; height: 26px;">
  <span class="w-3.5 shrink-0 inline-block"></span>
  <span class="shrink-0 text-accent">
    {#if type === 'folder'}
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
    {:else}
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
    {/if}
  </span>
  <input bind:this={inputEl} bind:value={val} onkeydown={handleKeydown} onblur={() => uiStore.setCreatingItem(null)} class="flex-1 border outline-none text-xs px-1 py-0 rounded-sm bg-input border-focus text-primary h-[20px]" />
</div>
