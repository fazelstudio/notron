<!--
 * Markdown View Toggle
 *
 * Toggle control for markdown preview, code, and split modes.
-->

<script lang="ts">
  import DropdownMenu, { type DropdownMenuItem } from './DropdownMenu.svelte';
  import { editorStore } from '../../stores/editor';
  import { splitStore } from '../../stores/split';
  import { settingsStore } from '../../stores/settings.svelte';
  import { ChevronDown } from 'lucide-svelte';

  let { activeTab } = $props<{ activeTab: any }>();

  let mdViewMode = $derived(activeTab?.mdViewMode || settingsStore.effectiveSettings.default_md_view || 'preview');
  
  let currentMdViewLabel = $derived.by(() => {
    if (mdViewMode === 'preview') return 'Markdown Preview';
    if (mdViewMode === 'code') return 'Text Editor';
    if (mdViewMode === 'split') return 'Text & Preview';
    return 'Markdown Preview';
  });

  function setMdViewMode(mode: 'preview' | 'code' | 'split') {
    if (activeTab) {
      editorStore.updateTab(activeTab.id, { mdViewMode: mode });
      splitStore.updateTabInAllPanes({ id: activeTab.id, mdViewMode: mode });
    }
  }

  function setMdDefault(mode: 'preview' | 'code' | 'split') {
    settingsStore.updateSetting('default_md_view', mode, 'global');
    if (activeTab) {
      editorStore.updateTab(activeTab.id, { mdViewMode: mode });
      splitStore.updateTabInAllPanes({ id: activeTab.id, mdViewMode: mode });
    }
  }

  let mdMenuItems = $derived<DropdownMenuItem[]>([
    { label: 'Markdown Preview', action: () => setMdViewMode('preview') },
    { label: 'Text Editor', action: () => setMdViewMode('code') },
    { label: 'Text & Preview', action: () => setMdViewMode('split') },
    { separator: true, label: '' },
    { 
      label: 'Set default...', 
      id: 'default',
      items: [
        { label: 'Markdown Preview', action: () => setMdDefault('preview') },
        { label: 'Text Editor', action: () => setMdDefault('code') },
        { label: 'Text & Preview', action: () => setMdDefault('split') }
      ]
    }
  ]);
</script>

<div>
  <DropdownMenu items={mdMenuItems} align="right">
    {#snippet trigger()}
      <button class="nt-control flex items-center gap-1.5 text-icon-default hover:text-icon-active hover:bg-hover text-icon-default hover:text-icon-active hover:bg-hover">
        {currentMdViewLabel}
        <ChevronDown size={12} class="opacity-50" />
      </button>
    {/snippet}
  </DropdownMenu>
</div>
