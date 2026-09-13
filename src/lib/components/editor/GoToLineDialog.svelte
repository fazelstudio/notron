<script lang="ts">
  import Modal from '../common/Modal.svelte';

  let { isOpen, onClose, onGoToLine }: { isOpen: boolean; onClose: () => void; onGoToLine: (line: number) => void } = $props();

  let lineStr = $state('');
  let inputEl: HTMLInputElement | undefined = $state();

  function handleSubmit() {
    const line = parseInt(lineStr, 10);
    if (!isNaN(line) && line > 0) {
      onGoToLine(line);
      onClose();
    }
  }

  $effect(() => {
    if (isOpen) {
      lineStr = '';
      requestAnimationFrame(() => inputEl?.focus());
    }
  });
</script>

<Modal {isOpen} title="Go to Line" {onClose} widthClass="max-w-xs">
  {#snippet children()}
    <div class="p-4 space-y-3">
      <input
        bind:this={inputEl}
        type="number"
        min="1"
        class="w-full px-3 py-2 text-sm rounded outline-none border bg-input border-subtle text-primary placeholder-muted focus:border-focus"
        placeholder="Enter line number..."
        bind:value={lineStr}
        onkeydown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
      />
    </div>
  {/snippet}
  {#snippet footer()}
    <div class="flex justify-end">
      <button
        onclick={handleSubmit}
        disabled={!lineStr.trim()}
        class="px-4 py-1.5 text-sm font-medium bg-accent hover:bg-accent-hover text-on-accent disabled:opacity-50 rounded outline-none"
      >Go</button>
    </div>
  {/snippet}
</Modal>
