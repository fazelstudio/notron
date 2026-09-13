<script lang="ts">
  import { eventBus } from '../../utils/eventBus';
  import { uiStore } from '../../stores/ui';
  import { exists } from '@tauri-apps/plugin-fs';
  import Modal from '../common/Modal.svelte';

  const ui = uiStore;
  let isOpen = $derived($ui.isRecentFoldersModalOpen);

  async function handleOpenRecent(path: string) {
    if (path === uiStore.getSnapshot().explorerRoot) {
      uiStore.closeRecentFoldersModal();
      return;
    }
    try {
      const doesExist = await exists(path);
      if (!doesExist) { alert(`Path not found: ${path}`); return; }
      eventBus.emit('request-workspace-switch', { path });
      uiStore.closeRecentFoldersModal();
    } catch (err) { alert(`Failed to load folder: ${err}`); }
  }
</script>

<Modal 
  {isOpen} 
  title="Recent Folders" 
  onClose={() => uiStore.closeRecentFoldersModal()}
  widthClass="max-w-lg"
>
  <div class="p-2" style="max-height: 40.5rem;">
    {#each $ui.recentWorkspaces as path (path)}
      <button onclick={() => handleOpenRecent(path)} class="flex flex-col items-start w-full text-left opacity-80 hover:opacity-100 transition-opacity p-3 rounded hover:bg-hover h-[4.5rem] justify-center">
        <span class="font-medium truncate w-full">{path.split(/[/\\]/).pop()}</span>
        <span class="text-xs opacity-50 truncate w-full">{path}</span>
      </button>
    {/each}
  </div>
  {#snippet footer()}
    <button onclick={() => { uiStore.clearRecentWorkspaces(); uiStore.closeRecentFoldersModal(); }} class="flex flex-col items-start w-full text-left opacity-80 hover:opacity-100 transition-opacity p-1 rounded hover:bg-error/10 text-error h-[3.5rem] justify-center">
      <span class="font-medium truncate w-full text-center">Clear all recent...</span>
    </button>
  {/snippet}
</Modal>
