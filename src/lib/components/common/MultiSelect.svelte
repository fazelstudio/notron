<!--
 * Multi Select
 *
 * Multi-select dropdown with search, chips, and keyboard navigation.
-->

<script lang="ts">
  import { X } from 'lucide-svelte';
  import Tooltip from './Tooltip.svelte';
  import type { ComponentType } from 'svelte';

  let {
    options = [],
    selected = $bindable([]),
    query = $bindable(''),
    placeholder = "Type to search...",
    id = "",
    Icon,
    onselect,
    onremove
  }: {
    options: string[];
    selected: string[];
    query: string;
    placeholder?: string;
    id?: string;
    Icon?: ComponentType;
    onselect?: (val: string) => void;
    onremove?: (val: string) => void;
  } = $props();

  let container: HTMLElement;
  let isFocused = $state(false);

  function handleAdd(val: string) {
    if (onselect) onselect(val);
  }

  function handleRemove(val: string) {
    if (onremove) onremove(val);
  }
  
  function handleWindowClick(e: MouseEvent) {
    if (isFocused && container && !container.contains(e.target as Node)) {
      isFocused = false;
    }
  }
</script>

<svelte:window onclick={handleWindowClick} />

<div bind:this={container} class="flex flex-col gap-1 relative w-full">
  <div class="flex flex-wrap items-center gap-1 border rounded-[2px] px-1.5 py-1 border-subtle bg-input min-h-[var(--nt-control-height)]" class:border-focus={isFocused}>
    {#each selected as item}
      <div class="flex items-center gap-1 px-1.5 py-0.5 bg-elevated rounded-[2px] text-xs border border-subtle">
        {#if Icon}<Icon size={12} class="text-accent" />{/if}
        <Tooltip content={item}>
          <span class="truncate max-w-[150px]">{item.split('/').pop()}</span>
        </Tooltip>
        <button aria-label="Remove" onclick={() => handleRemove(item)} class="hover:text-error p-0.5 rounded-full hover:bg-surface">
          <X size={12} />
        </button>
      </div>
    {/each}
    <input 
      {id} 
      type="text" 
      bind:value={query} 
      onfocus={() => isFocused = true}
      placeholder={selected.length === 0 ? placeholder : ""} 
      class="flex-1 bg-transparent text-xs outline-none min-w-[120px] placeholder-muted ml-1" 
    />
  </div>
  
  <!-- Dropdown -->
  {#if query.trim().length > 0 && isFocused}
    <div class="absolute z-50 top-[100%] left-0 w-full flex flex-col mt-1 overflow-y-auto nt-menu-panel" style="max-height: {5 * 26}px;">
      {#if options.length > 0}
        {#each options as opt}
          <button onclick={() => handleAdd(opt)} class="nt-menu-item gap-2 text-left shrink-0 hover:bg-hover">
            {#if Icon}<Icon size={12} class="text-muted shrink-0" />{/if}
            <span class="truncate flex-1">{opt}</span>
          </button>
        {/each}
      {:else}
        <div class="px-2 py-1 text-xs text-muted text-center shrink-0">No matching items found.</div>
      {/if}
    </div>
  {/if}
</div>
