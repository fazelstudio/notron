<script lang="ts">
/**
 * ScmView
 *
 * UI component..
 */
  /**
   * SCM View
   *
   * Generic Source Control view. It renders whatever SCM providers are
   * registered (Git is one of them, not the only one architecturally), so a
   * new version-control provider is a registration — no shell change.
   */
  import { scmRegistry } from '../../workbench/scmRegistry';

  let version = $state(0);

  $effect(() => {
    const d = scmRegistry.onDidChange(() => version++);
    return () => d.dispose();
  });

  let providers = $derived.by(() => {
    void version;
    return scmRegistry.getVisible();
  });
</script>

<div class="flex flex-col h-full overflow-hidden">
  {#if providers.length === 0}
    <div class="p-4 text-xs text-muted">No source control providers registered.</div>
  {/if}
  {#each providers as provider (provider.id)}
    {@const showHeader = providers.length > 1}
    <div class="flex flex-col {providers.length > 1 ? 'flex-1 min-h-0' : 'h-full'} overflow-hidden">
      {#if showHeader}
        <div class="h-6 px-3 flex items-center text-[10px] font-semibold uppercase tracking-widest text-muted border-b border-subtle shrink-0">
          {provider.label}
        </div>
      {/if}
      {#await provider.loadComponent() then module}
        {@const Component = module.default ?? module}
        {#if Component}
          <Component />
        {/if}
      {/await}
    </div>
  {/each}
</div>
