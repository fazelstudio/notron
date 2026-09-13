<script lang="ts">
  import { eventBus } from '../../utils/eventBus';
  import { uiStore } from '../../stores/ui';
  import Modal from '../common/Modal.svelte';

  const ui = uiStore;
  let path = $derived($ui.pendingTrustPath);
  let isOpen = $derived(!!path);

  function handleCancel() {
    uiStore.setPendingTrustPath(null);
  }

  function handleTrust() {
    if (path) {
      eventBus.emit('request-workspace-switch', { path });
    }
    uiStore.setPendingTrustPath(null);
  }
</script>

<Modal {isOpen} title="Trust this folder?" onClose={handleCancel} widthClass="max-w-md">
  <div class="p-6">
    <p class="text-sm opacity-80 mb-6">
      Do you trust the authors of the files in this folder?<br/>
      <span class="font-mono text-xs opacity-60 mt-2 block break-all bg-surface-2 p-2 rounded">{path}</span>
    </p>
  </div>
  
  {#snippet footer()}
    <div class="flex justify-end gap-3 w-full">
      <button onclick={handleCancel} class="px-4 py-2 text-sm rounded bg-surface-2 hover:bg-hover transition-colors text-primary border border-subtle">
        Cancel
      </button>
      <button onclick={handleTrust} class="px-4 py-2 text-sm rounded bg-accent hover:bg-accent-hover transition-colors text-on-accent border border-transparent">
        Yes, Trust this folder
      </button>
    </div>
  {/snippet}
</Modal>
