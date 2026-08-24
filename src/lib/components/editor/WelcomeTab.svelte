<script lang="ts">
  import { uiStore } from '../../stores/ui';
  import { open } from '@tauri-apps/plugin-dialog';
  import { exists } from '@tauri-apps/plugin-fs';

  const ui = uiStore;

  async function handleOpenRecent(path: string) {
    if (path === uiStore.getSnapshot().explorerRoot) return;
    try {
      const doesExist = await exists(path);
      if (!doesExist) { alert(`Path not found: ${path}`); return; }
      window.dispatchEvent(new CustomEvent('request-workspace-switch', { detail: { path } }));
    } catch (err) { alert(`Failed to load folder: ${err}`); }
  }

  function handleNewFile() { uiStore.openNewFileDialog('welcome'); }

  function handleRemoveRecent(e: MouseEvent, path: string) {
    e.stopPropagation();
    uiStore.removeRecentWorkspace(path);
  }

  async function handleOpenFile() {
    try {
      const selected = await open({ multiple: false });
      if (selected && typeof selected === 'string') {
        // Route through the central open handler: the tab opens immediately
        // and the content streams in from the background.
        window.dispatchEvent(new CustomEvent('request-open-file', { detail: { path: selected } }));
      }
    } catch (err) { console.error(err); }
  }

  async function handleOpenFolder() {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        if (selected === uiStore.getSnapshot().explorerRoot) return;
        if (!$ui.recentWorkspaces.includes(selected)) {
          uiStore.setPendingTrustPath(selected);
        } else {
          window.dispatchEvent(new CustomEvent('request-workspace-switch', { detail: { path: selected } }));
        }
      }
    } catch (err) { console.error(err); }
  }

  let displayedRecent = $derived($ui.recentWorkspaces.slice(0, 5));
  let hasMore = $derived($ui.recentWorkspaces.length > 5);
</script>

<div class="flex-1 flex flex-col items-center justify-center h-full w-full bg-transparent overflow-y-auto p-8">
  <div class="max-w-2xl w-full">
    <div class="flex items-center gap-4 mb-12 select-none">
      <img src="/notron.png" alt="Notron" class="w-16 h-16 pointer-events-none" />
      <h1 class="text-4xl font-semibold opacity-90">Notron</h1>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
      <div class="space-y-6">
        <h2 class="text-sm font-semibold opacity-60 uppercase tracking-wider mb-4">Start</h2>
        <button onclick={handleNewFile} class="flex items-center gap-3 w-full text-left opacity-80 hover:opacity-100 transition-opacity p-2 rounded hover:bg-hover">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>New File</span>
        </button>
        <button onclick={handleOpenFile} class="flex items-center gap-3 w-full text-left opacity-80 hover:opacity-100 transition-opacity p-2 rounded hover:bg-hover">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span>Open File...</span>
        </button>
        <button onclick={handleOpenFolder} class="flex items-center gap-3 w-full text-left opacity-80 hover:opacity-100 transition-opacity p-2 rounded hover:bg-hover">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
          <span>Open Folder...</span>
        </button>
      </div>
      <div class="space-y-6">
        <h2 class="text-sm font-semibold opacity-60 uppercase tracking-wider mb-4">Recent</h2>
        {#if displayedRecent.length === 0}
          <p class="text-sm opacity-50 p-2">No recent folders</p>
        {:else}
          <div class="flex flex-col">
            {#each displayedRecent as path (path)}
              <div class="group flex items-center w-full text-left opacity-80 hover:opacity-100 transition-opacity p-2 rounded hover:bg-hover">
                <div class="flex flex-col flex-1 min-w-0">
                  <button onclick={() => handleOpenRecent(path)} class="font-medium truncate w-full text-left">{path.split(/[/\\]/).pop()}</button>
                  <button onclick={() => handleOpenRecent(path)} class="text-xs opacity-50 truncate w-full text-left">{path}</button>
                </div>
                <button onclick={(e) => handleRemoveRecent(e, path)} title="Remove from recent"
                  class="shrink-0 p-1 rounded text-icon-muted hover:text-error hover:bg-hover opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            {/each}
            {#if hasMore}
              <button onclick={() => uiStore.openRecentFoldersModal()} class="flex items-center gap-2 w-full text-left text-accent opacity-80 hover:opacity-100 transition-opacity p-2 rounded hover:bg-hover mt-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>More Recent...</span>
              </button>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>

</div>
