<!--
 * Close Tab Dialog
 *
 * Confirmation dialog for closing tabs with unsaved changes.
-->

<script lang="ts">
  import Modal from '../common/Modal.svelte';

  let { isOpen, fileName, onSave, onDontSave, onCancel }: {
    isOpen: boolean; fileName: string;
    onSave: () => void; onDontSave: () => void; onCancel: () => void;
  } = $props();
</script>

<Modal {isOpen} title="Unsaved Changes" onClose={onCancel} widthClass="max-w-sm">
  {#snippet children()}
    <div class="p-2">
      <p class="text-xs text-secondary">Do you want to save the changes you made to <span class="font-semibold text-primary">{fileName}</span>?</p>
    </div>
  {/snippet}
  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <button
        onclick={onCancel}
        class="nt-control bg-input border border-subtle hover:bg-hover text-primary"
      >Cancel</button>
      <button
        onclick={onDontSave}
        class="nt-control"
        style="background-color: color-mix(in srgb, var(--color-error) 20%, transparent); color: var(--color-error);"
      >Don't Save</button>
      <button onclick={onSave} class="nt-control bg-accent hover:bg-accent-hover text-on-accent">Save</button>
    </div>
  {/snippet}
</Modal>
