<!--
 * Editor Fold Marker
 *
 * Fold gutter marker rendered with a themed icon and tooltip.
-->

<script lang="ts">
  import Tooltip from './Tooltip.svelte';
  let { open } = $props<{ open: boolean }>();
</script>

<Tooltip content={open ? 'Fold' : 'Unfold'} side="top" wrapperClass="w-full h-full flex items-center justify-center">
  <div class="custom-fold-marker {open ? 'is-open' : 'is-closed'} cursor-pointer flex items-center justify-center w-full h-full text-muted hover:text-primary">
    {#if open}
      <!-- 90 degree corner arrow pointing down -->
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform: rotate(90deg);">
        <path d="M9 18L15 12L9 6" />
      </svg>
    {:else}
      <!-- 90 degree corner arrow pointing right -->
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 18L15 12L9 6" />
      </svg>
    {/if}
  </div>
</Tooltip>
