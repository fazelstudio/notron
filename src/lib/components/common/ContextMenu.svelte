<script lang="ts">
  import { portal } from '../../utils/menuPosition';
  
  export interface MenuItem {
    id: string;
    label: string;
    action: () => void;
    disabled?: boolean;
    shortcut?: string;
    separator?: boolean;
  }

  let { items, children }: { items: MenuItem[]; children: import('svelte').Snippet } = $props();

  let open = $state(false);
  let pos = $state({ x: 0, y: 0 });
  let menuElement = $state<HTMLDivElement>();

  
  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    pos = { x: e.clientX, y: e.clientY };
    open = true;
  }

  function handleClickOutside() {
    open = false;
  }

  function handleItemAction(item: MenuItem) {
    if (!item.disabled) {
      item.action();
    }
    open = false;
  }

  $effect(() => {
    if (!open || !menuElement) return;
    const frame = requestAnimationFrame(() => {
      const rect = menuElement?.getBoundingClientRect();
      if (!rect || !menuElement) return;
      const gap = 8;
      const x = Math.max(gap, Math.min(pos.x, window.innerWidth - rect.width - gap));
      const y = Math.max(gap, Math.min(pos.y, window.innerHeight - rect.height - gap));
      menuElement.style.left = `${x}px`;
      menuElement.style.top = `${y}px`;
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<svelte:window onclick={handleClickOutside} oncontextmenu={handleClickOutside} />

<div role="presentation" style="display: contents" oncontextmenu={handleContextMenu}>
  {@render children()}
</div>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    use:portal
    class="fixed inset-0 z-[99]"
    role="presentation"
    onclick={handleClickOutside}
    oncontextmenu={(e) => { e.preventDefault(); handleClickOutside(); }}
    onkeydown={(e) => { if (e.key === 'Escape') handleClickOutside(); }}
  ></div>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={menuElement}
    use:portal
    role="presentation"
    class="fixed min-w-[220px] rounded-md border p-1 z-[2147483646] animate-in fade-in duration-100 bg-[var(--nt-overlay-bg)] border-[var(--nt-overlay-border)] text-[var(--nt-overlay-fg)]"
    style="left: {pos.x}px; top: {pos.y}px; box-shadow: var(--nt-overlay-shadow);"
    onclick={(e) => e.stopPropagation()}
    oncontextmenu={(e) => e.stopPropagation()}
  >
    {#each items as item (item.id)}
      {#if item.separator}
        <div class="h-px my-1 bg-[var(--nt-overlay-border)]"></div>
      {:else}
        <button
          class="flex items-center justify-between w-full px-2 py-1.5 text-xs rounded-sm cursor-pointer select-none outline-none transition-colors {!item.disabled ? 'hover:bg-selected focus:bg-selected hover:text-primary focus:text-primary text-secondary' : 'text-muted'}"
          disabled={item.disabled}
          onclick={() => handleItemAction(item)}
          onmouseenter={(e) => (e.target as HTMLElement).focus()}
        >
          <span>{item.label}</span>
          {#if item.shortcut}
            <span class="ml-auto text-[10px] text-muted opacity-80">{item.shortcut}</span>
          {/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}
