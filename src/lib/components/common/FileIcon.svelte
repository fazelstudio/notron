<script lang="ts">
/**
 * File Icon
 *
 * Renders a file or folder icon for the active icon theme.
 */
  import { Folder, FolderOpen } from 'lucide-svelte';
  import { getFileIcon } from '../../icon-theme/default';
  import { settingsStore } from '../../stores/settings.svelte';
  import { getIconProvider } from '../../icon-theme/registry';

  let {
    name,
    isDir = false,
    isOpen = false,
    size = 14,
    iconClass = '',
    style = ''
  }: {
    name: string;
    isDir?: boolean;
    isOpen?: boolean;
    size?: number;
    iconClass?: string;
    style?: string;
  } = $props();

  let iconTheme = $derived(settingsStore.effectiveSettings.icon_theme);
  let provider = $derived(getIconProvider(iconTheme) ?? getIconProvider('default'));
  let isOff = $derived(iconTheme === 'off' || !provider);
  // Capability, not name: any provider that can render SVG is treated as SVG theme.
  let hasSvgIcons = $derived(typeof (provider as any)?.getFileIconSvg === 'function');
  let materialSvg = $derived(hasSvgIcons ? ((provider as any).getFileIconSvg?.(name, size) ?? '') : '');
  let materialFolderSvg = $derived(hasSvgIcons ? ((provider as any).getFolderIconSvg?.(name, size, !!isOpen) ?? '') : '');
</script>

{#if !isOff}
  {#if isDir}
    {#if hasSvgIcons}
      <span class="shrink-0 inline-flex items-center justify-center" style="width:{size}px;height:{size}px" aria-hidden="true">{@html materialFolderSvg}</span>
    {:else}
      {#if isOpen}
        <FolderOpen {size} class={iconClass} {style} />
      {:else}
        <Folder {size} class={iconClass} {style} />
      {/if}
    {/if}
  {:else if hasSvgIcons}
    <span class="shrink-0 inline-flex items-center justify-center" style="width:{size}px;height:{size}px" aria-hidden="true">{@html materialSvg}</span>
  {:else}
    {@const Icon = getFileIcon(name)}
    <Icon {size} class={iconClass} {style} />
  {/if}
{/if}
