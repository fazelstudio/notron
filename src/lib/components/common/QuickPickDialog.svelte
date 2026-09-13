<script lang="ts">
/**
 * QuickPickDialog
 *
 * UI component..
 */
  /**
   * Quick Pick Dialog
   *
   * Renders the quick pick requested through dialogStore (command-palette
   * style picker available to any command/feature).
   */
  import { dialogStore, quickPickState, type QuickPickItem } from '../../stores/dialog';
  import { FZF_LIMIT } from '../../constants';

  let request = $derived($quickPickState);
  let query = $state('');
  let selectedIndex = $state(0);
  let pickedLabels = $state<Set<string>>(new Set());
  let inputEl: HTMLInputElement | undefined = $state();

  let filtered = $derived.by<QuickPickItem[]>(() => {
    const items = request?.items ?? [];
    const q = query.trim().toLowerCase();
    const matched = !q
      ? items
      : items.filter((i: QuickPickItem) =>
          `${i.label} ${i.description ?? ''} ${i.detail ?? ''}`.toLowerCase().includes(q)
        );
    return matched.slice(0, FZF_LIMIT);
  });

  $effect(() => {
    if (request) {
      query = '';
      selectedIndex = 0;
      pickedLabels = new Set(request.items.filter((i: QuickPickItem) => i.picked).map((i: QuickPickItem) => i.label));
      setTimeout(() => inputEl?.focus(), 0);
    }
  });

  function confirm() {
    if (!request) return;
    if (request.canPickMany) {
      const selected = request.items.filter((i: QuickPickItem) => pickedLabels.has(i.label));
      dialogStore.resolveQuickPick(selected.length > 0 ? selected : undefined);
      return;
    }
    const item = filtered[selectedIndex];
    dialogStore.resolveQuickPick(item ?? undefined);
  }

  function cancel() {
    dialogStore.resolveQuickPick(undefined);
  }

  function togglePicked(item: QuickPickItem) {
    const next = new Set(pickedLabels);
    if (next.has(item.label)) next.delete(item.label);
    else next.add(item.label);
    pickedLabels = next;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      selectedIndex = Math.min(selectedIndex + 1, Math.max(filtered.length - 1, 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      confirm();
    }
  }
</script>

{#if request}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[199] bg-black/15 backdrop-blur-[1px]"
    role="presentation"
    onclick={cancel}
    onkeydown={(e) => { if (e.key === 'Escape') cancel(); }}
  ></div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed z-[200] top-9 left-1/2 -translate-x-1/2 w-[clamp(360px,38vw,620px)] max-w-[calc(100vw-280px)] rounded-lg border flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 bg-[var(--nt-overlay-bg)] border-[var(--nt-overlay-border)]"
    style="max-height: min(70vh, 520px); box-shadow: var(--nt-overlay-shadow);"
    role="dialog"
    tabindex="-1"
    aria-label="Quick Pick"
    onclick={(e) => e.stopPropagation()}
    onkeydown={handleKeydown}
  >
      <input
        bind:this={inputEl}
        bind:value={query}
        placeholder={request.placeHolder || 'Type to filter'}
        class="w-full px-3 py-2 text-sm outline-none border-b bg-[var(--nt-overlay-bg)] text-[var(--nt-overlay-fg)] border-[var(--nt-overlay-border)]"
        onkeydown={handleKeydown}
      />
      <div class="max-h-[300px] overflow-y-auto py-1">
        {#if filtered.length === 0}
          <div class="px-3 py-2 text-xs text-muted">No results</div>
        {/if}
        {#each filtered as item, index (item.id ?? item.label)}
          <button
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors {index === selectedIndex && !request.canPickMany ? 'bg-selected text-primary' : 'text-secondary hover:bg-hover'}"
            onclick={() => (request!.canPickMany ? togglePicked(item) : dialogStore.resolveQuickPick(item))}
            onmouseenter={() => (selectedIndex = index)}
          >
            {#if request.canPickMany}
              <span class="w-3 text-accent">{pickedLabels.has(item.label) ? '✓' : ''}</span>
            {/if}
            <span class="flex-1 min-w-0">
              <span class="block truncate text-primary">{item.label}</span>
              {#if item.description || item.detail}
                <span class="block truncate text-muted">{item.description ?? item.detail}</span>
              {/if}
            </span>
          </button>
        {/each}
      </div>
    </div>
{/if}
