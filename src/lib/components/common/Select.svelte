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
</script>

<svelte:window onclick={handleWindowClick} />

<div bind:this={container} class="relative inline-block {className}">
  <button
    {id}
    type="button"
    onclick={() => isOpen = !isOpen}
    class="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm bg-input border border-subtle rounded transition-colors hover:border-strong focus:border-focus focus:outline-none text-left"
    class:border-focus={isOpen}
  >
    <span class="truncate block text-primary" class:text-muted={!value}>{selectedLabel}</span>
    <ChevronDown size={14} class="text-muted shrink-0 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}" />
  </button>

  {#if isOpen}
    <div class="absolute z-50 top-[100%] right-0 min-w-full flex flex-col border border-subtle rounded mt-1 bg-elevated overflow-y-auto shadow-elevated max-h-60">
      {#each normalizedOptions as opt}
        <button
          type="button"
          onclick={() => handleSelect(opt.value)}
          class="flex items-center justify-between w-full px-3 py-2 text-sm text-left transition-colors hover:bg-hover hover:text-primary {value === opt.value ? 'bg-selected text-primary font-medium' : 'text-secondary'}"
        >
          <span class="truncate pr-4">{opt.label}</span>
          {#if value === opt.value}
            <Check size={14} class="text-accent shrink-0" />
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
