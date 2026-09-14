<!--
 * New File Dialog
 *
 * Modal for creating a new untitled file.
-->

<script lang="ts">
  import { eventBus } from '../../utils/eventBus';
  import Modal from '../common/Modal.svelte';
  import { uiStore } from '../../stores/ui';
  import { invoke } from '@tauri-apps/api/core';

  let { isOpen, onClose, isFromWelcome = false }: { isOpen: boolean; onClose: () => void; isFromWelcome?: boolean } = $props();

  let fileName = $state('');
  let inputEl: HTMLInputElement | undefined = $state();
  const ui = uiStore;

  $effect(() => {
    if (isOpen) {
      fileName = '';
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  async function handleCreate() {
    if (!fileName.trim()) return;
    if (!$ui.explorerRoot) {
      alert("Please open a workspace folder first.");
      onClose();
      return;
    }
    try {
      let targetDir = $ui.explorerRoot;
      if (!isFromWelcome && $ui.selectedExplorerPath) {
        try {
          await invoke('read_directory', { path: $ui.selectedExplorerPath });
          targetDir = $ui.selectedExplorerPath;
        } catch {
          const sep = $ui.selectedExplorerPath.includes('\\') ? '\\' : '/';
          const parts = $ui.selectedExplorerPath.split(sep);
          parts.pop();
          targetDir = parts.join(sep);
        }
      }
      const sep = targetDir.includes('\\') ? '\\' : '/';
      const fullPath = `${targetDir}${sep}${fileName}`;
      await invoke('create_file', { path: fullPath });
      uiStore.triggerExplorerRefresh();
      // Open through the central handler so the new file lands in the active
      // pane tab bar like any other open.
      eventBus.emit('request-open-file', { path: fullPath });
      onClose();
    } catch (err) { alert(`Failed to create file: ${err}`); }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleCreate();
  }
</script>

<Modal {isOpen} title="New File" {onClose} widthClass="max-w-sm">
  {#snippet children()}
    <div class="p-2" onkeydown={handleKeydown} role="none">
      <input
        bind:this={inputEl}
        type="text"
        placeholder="File name (e.g. index.tsx)"
        bind:value={fileName}
        class="w-full px-2 h-[var(--nt-control-height)] text-xs rounded-[2px] outline-none border bg-input border-subtle text-primary placeholder-muted focus:border-focus"
      />
    </div>
  {/snippet}
  {#snippet footer()}
    <div class="flex justify-end">
      <button
        onclick={handleCreate}
        disabled={!fileName.trim()}
        class="nt-control font-medium bg-accent hover:bg-accent-hover text-on-accent disabled:opacity-50 disabled:hover:bg-accent rounded-[2px] outline-none"
      >Create</button>
    </div>
  {/snippet}
</Modal>
