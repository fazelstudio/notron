<script lang="ts">
/**
 * View Title Menu
 *
 * Generic title menu for a view or panel driven by the menu registry.
 */
  import { menuRegistry, type ResolvedMenuItem } from '../../workbench/menuRegistry';
  import Tooltip from './Tooltip.svelte';
  import { positionMenu, portal } from '../../utils/menuPosition';

  let { menuId, label = 'More Actions' }: { menuId: string; label?: string } = $props();

  let open = $state(false);
  let version = $state(0);
  let trigger: HTMLButtonElement | undefined = $state();
  let menuPosition = $state({ x: 0, y: 0 });
  let menuElement = $state<HTMLDivElement>();

  $effect(() => {
    const d = menuRegistry.onDidChange(() => version++);
    return () => d.dispose();
  });

  let items = $derived.by<ResolvedMenuItem[]>(() => {
    void version;
    return menuRegistry.getMenuItems(menuId);
  });

  function handleSelect(item: ResolvedMenuItem) {
    if (item.disabled) return;
    item.action();
    open = false;
  }

  function toggle() {
    if (!menuRegistry.hasMenu(menuId)) return;
    if (!open && trigger) {
      const rect = trigger.getBoundingClientRect();
      menuPosition = { x: rect.right, y: rect.bottom + 4 };
    }
    open = !open;
  }

  $effect(() => {
    if (!open || !menuElement || !trigger) return;
    const frame = requestAnimationFrame(() => {
      if (!menuElement || !trigger) return;
      const anchor = trigger.getBoundingClientRect();
      positionMenu(menuElement, menuPosition, { anchor, align: 'right' });
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

{#if menuRegistry.hasMenu(menuId)}
  <div class="relative">
    <Tooltip content={label}>
      <button
        bind:this={trigger}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onclick={toggle}
        class="p-1 rounded hover:bg-hover text-icon-default hover:text-icon-active"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
        </svg>
      </button>
    </Tooltip>

    {#if open}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div use:portal class="fixed inset-0 z-[2147483645]" role="presentation" onclick={() => (open = false)} oncontextmenu={(e) => { e.preventDefault(); open = false; }}></div>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        bind:this={menuElement}
        use:portal
        role="menu"
        tabindex="-1"
        class="fixed min-w-[200px] z-[2147483646] nt-menu-panel"
        style="left: {menuPosition.x}px; top: {menuPosition.y}px;"
        onclick={(e) => e.stopPropagation()}
        oncontextmenu={(e) => e.stopPropagation()}
      >
        {#each items as item (item.id)}
          {#if item.separator}
            <div class="nt-menu-separator"></div>
          {:else}
            <button
              role="menuitem"
              class="nt-menu-item justify-between gap-4 {!item.disabled ? 'hover:bg-selected focus:bg-selected text-secondary hover:text-primary' : 'text-muted'}"
              disabled={item.disabled}
              onclick={() => handleSelect(item)}
            >
              <span class="flex items-center gap-2">
                {#if item.checked}
                  <span class="text-accent">✓</span>
                {:else}
                  <span class="w-2"></span>
                {/if}
                {item.label}
              </span>
              {#if item.shortcut}
                <span class="ml-4 text-[length:var(--nt-chrome-font-tip)] text-muted opacity-80">{item.shortcut}</span>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
{/if}
