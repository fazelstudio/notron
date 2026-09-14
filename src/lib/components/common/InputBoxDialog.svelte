<script lang="ts">
/**
 * Input Box Dialog
 *
 * Renders the input box requested through dialogStore. Any command can await
 * a value without embedding its own modal.
 */
  import { dialogStore, inputBoxState } from '../../stores/dialog';

  let request = $derived($inputBoxState);
  let value = $state('');
  let error = $state<string | null>(null);
  let inputEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (request) {
      value = request.value;
      error = null;
      setTimeout(() => inputEl?.focus(), 0);
    }
  });

  function submit() {
    if (!request) return;
    const validationError = request.validateInput?.(value);
    if (validationError) {
      error = validationError;
      return;
    }
    dialogStore.resolveInputBox(value);
  }

  function cancel() {
    dialogStore.resolveInputBox(undefined);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }
</script>

{#if request}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[200] flex items-start justify-center pt-16 bg-black/30"
    role="presentation"
    onclick={cancel}
    onkeydown={(e) => { if (e.key === 'Escape') cancel(); }}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="w-[min(400px,90vw)] p-2 nt-dialog-panel"
      style="box-shadow: var(--nt-overlay-shadow);"
      role="dialog"
      tabindex="-1"
      aria-label="Input Box"
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleKeydown}
    >
      {#if request.prompt}
        <label class="block text-xs text-secondary mb-1" for="notron-input-box">{request.prompt}</label>
      {/if}
      <input
        id="notron-input-box"
        bind:this={inputEl}
        bind:value={value}
        type={request.password ? 'password' : 'text'}
        placeholder={request.placeHolder}
        class="w-full px-2 h-[var(--nt-control-height)] text-xs rounded-[2px] bg-surface-2 text-primary border border-subtle outline-none"
        onkeydown={handleKeydown}
      />
      {#if error}
        <div class="mt-1 text-[length:var(--nt-chrome-font-sm)] text-error">{error}</div>
      {/if}
      <div class="mt-2 flex justify-end gap-2">
        <button class="nt-control bg-surface-2 hover:bg-hover text-secondary" onclick={cancel}>Cancel</button>
        <button class="nt-control bg-accent text-on-accent hover:bg-accent-hover" onclick={submit}>OK</button>
      </div>
    </div>
  </div>
{/if}
