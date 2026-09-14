<!--
 * Trust Modal
 *
 * Prompt for trusting a workspace folder before opening.
-->

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
  <div class="p-2">
    <p class="text-xs opacity-80 mb-2">
      Do you trust the authors of the files in this folder?<br/>
      <span class="font-mono text-xs opacity-60 mt-1 block break-all bg-surface-2 p-1.5 rounded-[2px]">{path}</span>
    </p>
  </div>
  
  {#snippet footer()}
    <div class="flex justify-end gap-2 w-full">
      <button onclick={handleCancel} class="nt-control bg-surface-2 hover:bg-hover text-primary border border-subtle">
        Cancel
      </button>
      <button onclick={handleTrust} class="nt-control bg-accent hover:bg-accent-hover text-on-accent border border-transparent">
        Yes, Trust this folder
      </button>
    </div>
  {/snippet}
</Modal>
