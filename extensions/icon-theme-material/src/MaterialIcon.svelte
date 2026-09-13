<script lang="ts">
  import { materialFileIconSvg, materialFolderIconSvg } from './iconRenderer.svelte';

  let {
    name,
    isDir = false,
    size = 14,
    isOpen = false,
  }: {
    name: string;
    isDir?: boolean;
    size?: number;
    isOpen?: boolean;
  } = $props();

  let svg = $derived(
    isDir ? materialFolderIconSvg(name, size, isOpen) : materialFileIconSvg(name, size)
  );
</script>

<!--
  Renders the material icon for `name` as inline SVG. Resolution is
  synchronous (SVGs are bundled), so the icon is present on first paint.
-->
<span
  class="material-icon shrink-0 inline-flex items-center justify-center"
  style="width:{size}px;height:{size}px"
  aria-hidden="true"
>
  {@html svg}
</span>
