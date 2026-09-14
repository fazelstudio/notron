<!--
 * Dropdown Menu
 *
 * Generic dropdown menu with nested items and keyboard support.
-->

<script lang="ts">
  import { positionMenu, portal } from '../../utils/menuPosition';
  import type { Snippet } from 'svelte';
  
  export interface DropdownMenuItem {
    id?: string;
    label: string;
    action?: () => void;
    disabled?: boolean;
    shortcut?: string;
    separator?: boolean;
    items?: DropdownMenuItem[];
  }

  let { 
    items, 
    trigger,
    align = 'left',
    class: wrapperClass = '',
    matchWidth = false
  }: { 
    items: DropdownMenuItem[], 
    trigger: Snippet,
    align?: 'left' | 'right',
    class?: string,
    matchWidth?: boolean
  } = $props();

  let open = $state(false);
  let openSubmenuId = $state<string | null>(null);
  let triggerElement = $state<HTMLDivElement>();
  let menuElement = $state<HTMLDivElement>();

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    open = !open;
    if (!open) openSubmenuId = null;
  }

  function close() {
    open = false;
    openSubmenuId = null;
  }

  function handleItemAction(e: MouseEvent, item: DropdownMenuItem) {
    e.stopPropagation();
    if (item.disabled) return;
    
    if (item.items) {
      const id = item.id || item.label;
      openSubmenuId = openSubmenuId === id ? null : id;
    } else if (item.action) {
      item.action();
      close();
    }
  }

  function handleMouseEnter(item: DropdownMenuItem) {
    if (item.disabled) return;
    if (item.items) {
      openSubmenuId = item.id || item.label;
    } else {
      openSubmenuId = null;
    }
  }

  $effect(() => {
    if (!open || !triggerElement || !menuElement) return;
    const frame = requestAnimationFrame(() => {
      if (!triggerElement || !menuElement) return;
      const anchor = triggerElement.getBoundingClientRect();
      positionMenu(
        menuElement,
        { x: align === 'right' ? anchor.right : anchor.left, y: anchor.bottom + 4 },
        { anchor, align },
      );
      if (matchWidth) menuElement.style.width = `${anchor.width}px`;
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="relative inline-block text-left {wrapperClass}">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div bind:this={triggerElement} onclick={toggle} class="h-full flex items-center cursor-pointer">
    {@render trigger()}
  </div>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      use:portal
      class="fixed inset-0 z-[99]"
      role="presentation"
      onclick={close}
      oncontextmenu={(e) => { e.preventDefault(); close(); }}
      onkeydown={(e) => { if (e.key === 'Escape') close(); }}
    ></div>
    
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={menuElement}
      use:portal
      role="presentation"
      class="fixed min-w-[160px] z-[2147483646] nt-menu-panel"
      style="box-shadow: var(--nt-overlay-shadow);"
      onclick={(e) => e.stopPropagation()}
      oncontextmenu={(e) => e.stopPropagation()}
    >
      {#each items as item (item.id || item.label)}
        {#if item.separator}
          <div class="nt-menu-separator"></div>
        {:else}
          <div class="relative w-full" role="presentation" onmouseenter={() => handleMouseEnter(item)}>
            <button
              class="nt-menu-item justify-between {!item.disabled ? 'hover:bg-selected focus:bg-selected hover:text-primary focus:text-primary text-secondary' : 'text-muted'}"
              disabled={item.disabled}
              onclick={(e) => handleItemAction(e, item)}
              onmouseenter={(e) => (e.target as HTMLElement).focus()}
            >
              <span>{item.label}</span>
              {#if item.shortcut}
                <span class="ml-4 text-[length:var(--nt-chrome-font-tip)] text-muted opacity-80">{item.shortcut}</span>
              {/if}
              {#if item.items}
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ml-2 opacity-60"><polyline points="9 18 15 12 9 6"/></svg>
              {/if}
            </button>
            
            {#if item.items && openSubmenuId === (item.id || item.label)}
              <div
                class="absolute top-0 mt-0 min-w-[160px] z-[101] nt-menu-panel {align === 'right' ? 'right-full mr-1' : 'left-full ml-1'}"
                style="box-shadow: var(--nt-overlay-shadow);"
              >
                {#each item.items as subItem (subItem.id || subItem.label)}
                  {#if subItem.separator}
                    <div class="nt-menu-separator"></div>
                  {:else}
                    <button
                      class="nt-menu-item justify-between {!subItem.disabled ? 'hover:bg-selected focus:bg-selected hover:text-primary focus:text-primary text-secondary' : 'text-muted'}"
                      disabled={subItem.disabled}
                      onclick={(e) => { e.stopPropagation(); if (subItem.action) subItem.action(); close(); }}
                      onmouseenter={(e) => (e.target as HTMLElement).focus()}
                    >
                      <span>{subItem.label}</span>
                      {#if subItem.shortcut}
                        <span class="ml-4 text-[length:var(--nt-chrome-font-tip)] text-muted opacity-80">{subItem.shortcut}</span>
                      {/if}
                    </button>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
