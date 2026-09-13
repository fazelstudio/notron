<script lang="ts">
/**
 * FileIcon
 *
 * UI component..
 */
  /**
   * File Icon
   *
   * Renders a file or folder icon for the active icon theme. The theme is
   * chosen from settings and the matching renderer is picked here, so callers
   * never branch on theme ids and a new theme is one branch in this file.
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
  let isMaterial = $derived((provider as any)?.isMaterial === true);
  let materialSvg = $derived(isMaterial ? ((provider as any).getFileIconSvg?.(name, size) ?? '') : '');
  let materialFolderSvg = $derived(isMaterial ? ((provider as any).getFolderIconSvg?.(name, size, !!isOpen) ?? '') : '');
</script>

{#if !isOff}
  {#if isDir}
    {#if isMaterial}
      <span class="shrink-0 inline-flex items-center justify-center" style="width:{size}px;height:{size}px" aria-hidden="true">{@html materialFolderSvg}</span>
    {:else}
      {#if isOpen}
        <FolderOpen {size} class={iconClass} {style} />
      {:else}
        <Folder {size} class={iconClass} {style} />
      {/if}
    {/if}
  {:else if isMaterial}
    <span class="shrink-0 inline-flex items-center justify-center" style="width:{size}px;height:{size}px" aria-hidden="true">{@html materialSvg}</span>
  {:else}
    {@const Icon = getFileIcon(name)}
    <Icon {size} class={iconClass} {style} />
  {/if}
{/if}
