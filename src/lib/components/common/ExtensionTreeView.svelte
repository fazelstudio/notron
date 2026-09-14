<!--
 * Extension Tree View
 *
 * Renders SDK tree providers in a small, safe generic sidebar host.
-->

<script lang="ts">
  import { __getTreeDataProviders } from 'notron-sdk';
  import { commandRegistry } from '../../commands/registry';
  import { onMount } from 'svelte';

  let { viewId }: { viewId: string } = $props();
  let items = $state<any[]>([]);
  let loading = $state(false);

  async function refresh() {
    const provider = __getTreeDataProviders().get(viewId) as any;
    if (!provider) {
      items = [];
      return;
    }
    loading = true;
    try {
      const children = (await provider.getChildren()) ?? [];
      items = await Promise.all(children.map(async (element: any) => ({
        value: element,
        _treeItem: await provider.getTreeItem(element),
      })));
    } catch (error) {
      console.warn(`[extension-view] Unable to load ${viewId}:`, error);
      items = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    const provider = __getTreeDataProviders().get(viewId) as any;
    const disposable = provider?.onDidChangeTreeData?.(() => void refresh());
    void refresh();
    return () => disposable?.dispose?.();
  });
</script>

{#if loading}
  <div class="p-3 text-xs text-muted">Loading…</div>
{:else if items.length === 0}
  <div class="p-3 text-xs text-muted">No items</div>
{:else}
  <div class="flex flex-col py-1">
    {#each items as element, index (element?.id ?? element?.label ?? index)}
      {@const item = (element as any)?._treeItem ?? element}
      <button
        class="px-3 py-1.5 text-left text-xs hover:bg-hover text-secondary hover:text-primary truncate"
        title={item?.tooltip ?? item?.label ?? ''}
        onclick={() => {
          if (item?.command && commandRegistry.has(item.command.command ?? item.command)) {
            const command = item.command.command ?? item.command;
            void commandRegistry.execute(command, ...(item.command.arguments ?? []));
          }
        }}
      >
        <span>{item?.label ?? String(element)}</span>
        {#if item?.description}<span class="ml-2 text-muted">{item.description}</span>{/if}
      </button>
    {/each}
  </div>
{/if}
