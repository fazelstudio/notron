<!--
 * Horizontal Scrollbar
 *
 * Custom horizontal scrollbar synchronized with the editor scroll container.
-->

<script lang="ts">
  import { onDestroy } from 'svelte';

  export let target: HTMLElement | null = null;
  export let leftGap: number = 0;
  export let rightGap: number = 0;

  let thumbWidth = 0;
  let thumbLeft = 0;
  let show = false;
  let dragging = false;
  let startX = 0;
  let startScroll = 0;

  let resizeObserver: ResizeObserver | null = null;

  function update() {
    if (!target) return;
    const { scrollLeft, scrollWidth, clientWidth } = target;
    if (scrollWidth <= clientWidth + 1) {
      show = false;
      return;
    }
    show = true;
    const trackWidth = clientWidth - leftGap - rightGap;
    thumbWidth = Math.max(30, (clientWidth / scrollWidth) * trackWidth);
    const maxScroll = scrollWidth - clientWidth;
    const maxThumbPos = trackWidth - thumbWidth;
    thumbLeft = leftGap + (scrollLeft / maxScroll) * maxThumbPos;
  }

  function handlePointerDown(e: PointerEvent) {
    if (!target) return;
    dragging = true;
    startX = e.clientX;
    startScroll = target.scrollLeft;
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    e.preventDefault();
  }

  function handlePointerMove(e: PointerEvent) {
    if (!dragging || !target) return;
    const delta = e.clientX - startX;
    const { scrollWidth, clientWidth } = target;
    const trackWidth = clientWidth - leftGap - rightGap;
    const maxThumbPos = trackWidth - thumbWidth;
    if (maxThumbPos <= 0) return;
    const scrollRatio = delta / maxThumbPos;
    target.scrollLeft = startScroll + scrollRatio * (scrollWidth - clientWidth);
  }

  function handlePointerUp() {
    dragging = false;
    document.body.style.userSelect = '';
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
  }

  $: if (target) {
    update();
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => update());
    resizeObserver.observe(target);
    target.addEventListener('scroll', update);
  }

  onDestroy(() => {
    if (resizeObserver) resizeObserver.disconnect();
    if (target) target.removeEventListener('scroll', update);
    document.body.style.userSelect = '';
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
  });
</script>

{#if show}
  <div
    class="custom-horizontal-scrollbar"
    class:dragging
    style="left: {leftGap}px; right: {rightGap}px;"
  >
    <div
      class="thumb"
      role="none"
      style="width: {thumbWidth}px; left: {thumbLeft - leftGap}px;"
      onpointerdown={handlePointerDown}
    ></div>
  </div>
{/if}

<style>
  .custom-horizontal-scrollbar {
    position: absolute;
    bottom: 0;
    height: var(--nt-scrollbar-size);
    z-index: 9999999;
    background: transparent;
    opacity: 0;
    transition: opacity var(--nt-motion-fast);
  }

  :global(.editor-wrapper:hover) .custom-horizontal-scrollbar,
  .custom-horizontal-scrollbar.dragging {
    opacity: 1;
  }

  .thumb {
    position: absolute;
    height: 100%;
    background-color: var(--scrollbar-thumb);
    border-radius: 0;
    cursor: pointer;
    transition: background-color var(--nt-motion-fast);
  }

  .custom-horizontal-scrollbar:hover .thumb,
  .custom-horizontal-scrollbar.dragging .thumb {
    background-color: var(--scrollbar-thumb-hover);
  }
</style>
