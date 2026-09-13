<script lang="ts">

  import type { Snippet } from 'svelte';

  interface Props<T> {
    items: T[];
    itemHeight?: number;
    overscan?: number;
    class?: string;
    scrollTop?: number;
    /** Optional key function for #each. Defaults to item.path (or index). */
    getKey?: (item: T, index: number) => any;
    item: Snippet<[{ item: T; index: number }]>;
  }

  let {
    items,
    itemHeight = 22,
    overscan = 5,
    class: className = '',
    scrollTop = $bindable(0),
    getKey = (item: any, i: number) => item?.path ?? i,
    item: itemSnippet,
  }: Props<any> = $props();

  let containerEl: HTMLDivElement;
  let containerHeight = $state(0);

  let startIndex = $derived(
    Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  );
  let endIndex = $derived(
    Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    )
  );

  let totalHeight = $derived(items.length * itemHeight);
  let offsetY = $derived(startIndex * itemHeight);
  let visibleItems = $derived(items.slice(startIndex, endIndex + 1));

  function handleScroll(e: Event) {
    scrollTop = (e.target as HTMLDivElement).scrollTop;
    window.dispatchEvent(new CustomEvent('notron:cancel-tooltips'));
  }

  // Use ResizeObserver for container height (avoids layout thrashing)
  $effect(() => {
    if (!containerEl) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerHeight = entry.contentRect.height;
      }
    });
    ro.observe(containerEl);
    containerHeight = containerEl.clientHeight;
    return () => ro.disconnect();
  });
</script>

<div
  bind:this={containerEl}
  class="hover-scrollbar overflow-y-auto overflow-x-hidden h-full outline-none {className}"
  role="presentation"
  onscroll={handleScroll}
>
  <!-- Spacer that creates accurate scrollbar height -->
  <div style="height: {totalHeight}px; position: relative;">
    <!-- Only render visible slice, offset with translateY -->
    <div style="transform: translateY({offsetY}px);">
      {#each visibleItems as item, i (getKey(item, startIndex + i))}
        <div style="height: {itemHeight}px;">
          {@render itemSnippet({ item, index: startIndex + i })}
        </div>
      {/each}
    </div>
  </div>
</div>
