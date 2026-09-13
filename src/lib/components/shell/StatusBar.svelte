<script lang="ts">
/**
 * StatusBar
 *
 * UI component..
 */
  /**
 * Status Bar
 *
 * UI component for status bar.
 */
  import { editorStore } from '../../stores/editor';
  import { uiStore } from '../../stores/ui';
  import { statusBarRegistry } from '../../workbench/statusBarRegistry';
  import { commandRegistry } from '../../commands/registry';

  const ui = uiStore;
  const tabs = editorStore.tabs;
  const activeTabId = editorStore.activeTabId;
  const saveStatus = editorStore.saveStatus;

  // Reactive trigger — any change in these stores forces recompute of registry items.
  // The registry's getText() internally polls snapshots, so we need a reactive
  // dependency to re-evaluate when stores update.
  let _ui = $derived($ui);
  let _tabs = $derived($tabs);
  let _activeId = $derived($activeTabId);
  let _save = $derived($saveStatus);

  let leftItems = $derived.by(() => {
    void _ui; void _tabs; void _activeId; void _save;
    return statusBarRegistry.getByAlignment('left')
      .map((item) => {
        if (item.when && !item.when()) return null;
        const text = item.getText();
        if (!text) return null;
        return { ...item, text, tooltip: item.getTooltip?.() };
      })
      .filter(Boolean) as Array<{ id: string; text: string; tooltip?: string; command?: string }>;
  });

  let rightItems = $derived.by(() => {
    void _ui; void _tabs; void _activeId; void _save;
    return statusBarRegistry.getByAlignment('right')
      .map((item) => {
        if (item.when && !item.when()) return null;
        const text = item.getText();
        if (!text) return null;
        return { ...item, text, tooltip: item.getTooltip?.() };
      })
      .filter(Boolean) as Array<{ id: string; text: string; tooltip?: string; command?: string }>;
  });

  function handleClick(item: { command?: string }) {
    if (item.command && commandRegistry.has(item.command)) {
      void commandRegistry.execute(item.command);
    }
  }
</script>

{#if $ui.isStatusBarEnabled}
  <div class="h-6 flex items-center justify-between px-3 text-xs select-none border-t bg-[var(--nt-statusbar-bg)] text-[var(--nt-statusbar-fg)] border-[var(--nt-statusbar-border)]">
    <!-- Left -->
    <div class="flex items-center gap-4 min-w-[200px]">
      {#each leftItems as item (item.id)}
        <button
          class="hover:text-primary transition-colors text-left"
          title={item.tooltip ?? item.text}
          onclick={() => handleClick(item)}
          disabled={!item.command}
          class:cursor-pointer={!!item.command}
          class:cursor-default={!item.command}
        >{item.text}</button>
      {/each}
    </div>
    <!-- Right -->
    <div class="flex items-center gap-4">
      {#each rightItems as item (item.id)}
        <button
          class="hover:text-primary transition-colors text-right"
          title={item.tooltip ?? item.text}
          onclick={() => handleClick(item)}
          disabled={!item.command}
          class:cursor-pointer={!!item.command}
          class:cursor-default={!item.command}
        >{item.text}</button>
      {/each}
    </div>
  </div>
{/if}