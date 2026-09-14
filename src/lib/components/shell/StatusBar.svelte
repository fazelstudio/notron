<script lang="ts">
/**
 * Status Bar
 *
 * Displays status information and registry-driven items.
 */
  import { editorStore } from '../../stores/editor';
  import { uiStore } from '../../stores/ui';
  import { statusBarRegistry } from '../../workbench/statusBarRegistry';
  import { commandRegistry } from '../../commands/registry';

  const ui = uiStore;
  const tabs = editorStore.tabs;
  const activeTabId = editorStore.activeTabId;
  const saveStatus = editorStore.saveStatus;
  const cursorSignal = editorStore.cursorSignal;

  // Reactive trigger — any change in these stores forces recompute of registry items.
  // The registry's getText() internally polls snapshots, so we need a reactive
  // dependency to re-evaluate when stores update.
  let _ui = $derived($ui);
  let _tabs = $derived($tabs);
  let _activeId = $derived($activeTabId);
  let _save = $derived($saveStatus);
  let _cursor = $derived($cursorSignal);
  let registryVersion = $state(0);

  $effect(() => {
    const disposable = statusBarRegistry.onDidChange(() => registryVersion++);
    return () => disposable.dispose();
  });

  let leftItems = $derived.by(() => {
    void _ui; void _tabs; void _activeId; void _save; void _cursor; void registryVersion;
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
    void _ui; void _tabs; void _activeId; void _save; void _cursor; void registryVersion;
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
  <div class="h-[var(--nt-statusbar-height)] flex items-center justify-between px-2 text-[length:var(--nt-chrome-font-sm)] select-none border-t bg-[var(--nt-statusbar-bg)] text-[var(--nt-statusbar-fg)] border-[var(--nt-statusbar-border)]">
    <!-- Left -->
    <div class="flex items-center gap-3 min-w-[200px]">
      {#each leftItems as item (item.id)}
        <button
          class="hover:text-primary text-left"
          title={item.tooltip ?? item.text}
          onclick={() => handleClick(item)}
          disabled={!item.command}
        >{item.text}</button>
      {/each}
    </div>
    <!-- Right -->
    <div class="flex items-center gap-3">
      {#each rightItems as item (item.id)}
        <button
          class="hover:text-primary text-right"
          title={item.tooltip ?? item.text}
          onclick={() => handleClick(item)}
          disabled={!item.command}
        >{item.text}</button>
      {/each}
    </div>
  </div>
{/if}