<!--
 * Select
 *
 * Themed select dropdown with keyboard navigation.
-->

<script lang="ts">
  import { ChevronDown, Check } from 'lucide-svelte';

  let {
    options = [],
    value = $bindable(''),
    onchange,
    placeholder = "Select an option",
    id = "",
    class: className = ""
  }: {
    options: { label: string; value: string }[] | string[];
    value: string;
    onchange?: (val: string) => void;
    placeholder?: string;
    id?: string;
    class?: string;
  } = $props();

  let isOpen = $state(false);
  let container: HTMLElement;

  let normalizedOptions = $derived(
    options.map(opt => typeof opt === 'string' ? { label: opt, value: opt } : opt)
  );

  let selectedLabel = $derived(
    normalizedOptions.find(opt => opt.value === value)?.label || placeholder
  );

  function handleSelect(val: string) {
    value = val;
    isOpen = false;
    if (onchange) {
      onchange(val);
    }
  }

  function handleWindowClick(e: MouseEvent) {
    if (isOpen && container && !container.contains(e.target as Node)) {
      isOpen = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      isOpen = false;
    } else if (isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const list = container.querySelector('.nt-select-options');
      if (!list) return;
      const buttons = [...list.querySelectorAll('button')];
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'ArrowDown'
        ? Math.min(current + 1, buttons.length - 1)
        : Math.max(current - 1, 0);
      buttons[next]?.focus();
    }
  }
</script>

<svelte:window onclick={handleWindowClick} />

<div bind:this={container} class="relative inline-block {className}" onkeydown={handleKeydown} role="presentation">
  <button
    {id}
    type="button"
    onclick={() => isOpen = !isOpen}
    class="w-full flex items-center justify-between gap-2 px-2 h-[var(--nt-control-height)] text-xs bg-input border border-subtle rounded-[2px] hover:border-strong focus:border-focus focus:outline-none text-left"
    class:border-focus={isOpen}
  >
    <span class="truncate block text-primary" class:text-muted={!value}>{selectedLabel}</span>
    <ChevronDown size={12} class="text-muted shrink-0 {isOpen ? 'rotate-180' : ''}" />
  </button>

  {#if isOpen}
    <div class="absolute z-50 top-[100%] right-0 min-w-full flex flex-col border border-subtle rounded-[2px] mt-1 bg-elevated overflow-y-auto shadow-elevated max-h-60 nt-menu-panel nt-select-options">
      {#each normalizedOptions as opt}
        <button
          type="button"
          onclick={() => handleSelect(opt.value)}
          class="nt-menu-item justify-between text-left {value === opt.value ? 'bg-selected text-primary font-medium' : 'text-secondary hover:bg-hover hover:text-primary'}"
        >
          <span class="truncate pr-4">{opt.label}</span>
          {#if value === opt.value}
            <Check size={12} class="text-accent shrink-0" />
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
