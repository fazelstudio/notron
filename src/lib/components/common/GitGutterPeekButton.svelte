<!--
 * Git Gutter Peek Button
 *
 * Tooltip wrapper for git gutter peek toolbar buttons.
-->

<script lang="ts">
  import Tooltip from './Tooltip.svelte';
  import { onMount } from 'svelte';

  let { content, button }: { content: string; button: HTMLButtonElement } = $props();
  let holder: HTMLSpanElement;

  function hideTooltip() {
    window.dispatchEvent(new CustomEvent('notron:hide-tooltips'));
  }

  onMount(() => {
    if (holder && button) {
      holder.appendChild(button);
      button.addEventListener('click', hideTooltip);
    }
    return () => {
      button?.removeEventListener('click', hideTooltip);
    };
  });
</script>

<Tooltip {content} side="top" wrapperClass="inline-flex items-center">
  <span bind:this={holder}></span>
</Tooltip>
