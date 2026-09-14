<!--
 * Run Panel
 *
 * Sidebar panel for running and debugging launch configurations.
-->

<script lang="ts">
  import { runStore } from '../../stores/run';
  import { editorStore } from '../../stores/editor';
  import { terminalStore } from '../../stores/terminal';
  import { uiStore } from '../../stores/ui';
  import { ChevronDown, Play, Square } from 'lucide-svelte';

  const activeTabIdStore = editorStore.activeTabId;
  import { commandRegistry } from '../../commands/registry';
  import DropdownMenu, { type DropdownMenuItem } from '../common/DropdownMenu.svelte';
  import {
    hasLaunchJson,
    getRunPreview,
    refreshRunConfigurations,
    saveResolvedEntryAsConfig,
    activeRunTerminalIds
  } from '../../services/runService';

  let configurations = $derived($runStore.configurations);
  let selectedConfigurationName = $derived($runStore.selectedConfigurationName);

  let selectedConfig = $derived(
    configurations.find(c => c.name === selectedConfigurationName) || configurations[0] || null
  );
  let isSelectedDetected = $derived(selectedConfig?.source === 'detected');

  function tierLabel(tier: string | undefined) {
    if (!tier) return 'detected';
    return tier; // manifest | framework | heuristic | active
  }

  let configMenuItems = $derived<DropdownMenuItem[]>(
    configurations.length === 0
      ? [{ label: 'No Configurations', action: () => {}, disabled: true }]
      : configurations.map(c => ({
          label: c.source === 'detected' ? `${c.name} (${tierLabel(c.detectedTier)})` : c.name,
          action: () => runStore.selectConfiguration(c.name)
        }))
  );

  let preview = $state<string>('');
  $effect(() => {
    const cfg = selectedConfig;
    preview = cfg ? getRunPreview(cfg) : '';
  });

  // Reactive liveness check: recompute whenever the terminal list changes
  // (a run finishing removes its tab → Stop disables itself).
  let runningLabels = $state<string[]>([]);
  $effect(() => {
    void $terminalStore.terminals;
    runningLabels = activeRunTerminalIds();
  });
  const isRunning = () => runningLabels.length > 0;

  let launchJsonExists = $state(false);

  // Keep the configuration list in sync with the active editor file so the
  // "Current File" entry never goes stale (the editor recomputes continuously).
  let lastRefreshKey = $state<string>('');
  $effect(() => {
    const key = `${$uiStore.explorerRoot}|${$activeTabIdStore}`;
    if (!lastRefreshKey || lastRefreshKey !== key) {
      lastRefreshKey = key;
      refreshRunConfigurations().then(() => {
        hasLaunchJson().then(v => (launchJsonExists = v));
      });
    }
  });

  function saveSelectedConfig() {
    const cfg = selectedConfig;
    if (!cfg) return;
    saveResolvedEntryAsConfig({
      name: cfg.name,
      type: cfg.type as any,
      program: cfg.program || '',
      cwd: cfg.cwd || '',
      source: cfg.detectedTier || 'heuristic',
      tier: cfg.detectedTier || 'heuristic'
    });
  }

  function run() {
    void commandRegistry.execute('workbench.action.run');
  }

  function stop() {
    void commandRegistry.execute('workbench.action.stopRun');
  }
</script>

<div class="h-full flex flex-col bg-canvas text-primary overflow-hidden font-sans select-none">
  <div class="flex items-center gap-2 h-8 px-2 uppercase text-[length:var(--nt-chrome-font-sm)] font-bold tracking-wider text-secondary shrink-0">
    <span>RUN</span>
  </div>

  <div class="flex-1 min-h-0 flex flex-col">
    <div class="flex-1 overflow-y-auto hover-scrollbar">
      <div class="border-b border-subtle">
        <div class="px-2 pt-1 pb-2 space-y-2">
          <DropdownMenu items={configMenuItems} class="w-full" align="right" matchWidth>
            {#snippet trigger()}
              <div
                class="w-full h-6 bg-panel-2 border border-subtle text-xs text-primary outline-none px-2 rounded-[2px] hover:border-accent focus:border-accent flex items-center justify-between"
              >
                <span class="truncate">
                  {selectedConfig ? selectedConfig.name : 'No Configurations'}
                </span>
                <ChevronDown size={12} class="shrink-0 opacity-70" />
              </div>
            {/snippet}
          </DropdownMenu>

          <div class="flex items-center gap-1.5">
            <button
              class="flex items-center justify-center gap-1.5 flex-1 h-6 border border-accent bg-accent text-on-accent hover:bg-accent-hover text-xs rounded-[2px] font-medium"
              onclick={run}
              title="Run the selected configuration in the integrated terminal"
            >
              <Play size={12} fill="currentColor" />
              Run
            </button>
            {#if isRunning()}
              <button
                class="flex items-center justify-center gap-1.5 w-16 h-6 border border-subtle bg-panel-2 hover:bg-hover hover:border-error text-xs rounded-[2px]"
                onclick={stop}
                title="Stop all runs started from Notron"
              >
                <Square size={10} fill="currentColor" />
                Stop
              </button>
            {/if}
          </div>

          {#if preview}
            <div
              class="px-1.5 py-1 bg-panel border border-subtle rounded-[2px] text-[length:var(--nt-chrome-font-tip)] leading-snug text-muted break-all whitespace-pre-wrap max-h-20 overflow-y-auto hover-scrollbar"
              title="Command preview"
            >
              {preview}
            </div>
          {/if}

          {#if isSelectedDetected}
            <div class="flex items-center gap-1">
              <button
                class="flex-1 h-6 border border-subtle text-[length:var(--nt-chrome-font-sm)] text-secondary hover:text-primary hover:bg-hover rounded-[2px]"
                onclick={saveSelectedConfig}
              >
                Save as launch configuration
              </button>
            </div>
          {/if}

          <div class="space-y-2">
            <p class="text-xs text-secondary leading-snug">
              <button class="link-button" onclick={() => commandRegistry.execute('run.openFileForRunning')}>Open a file</button> which can be run.
            </p>

            <p class="text-xs text-secondary leading-snug">
              To customize Run <button class="link-button" onclick={() => commandRegistry.execute('run.createLaunchJson')}>create a launch.json file</button>.
            </p>

            {#if launchJsonExists}
              <p class="text-xs text-secondary leading-snug">
                <button class="link-button" onclick={() => commandRegistry.execute('run.openLaunchJson')}>Open launch.json</button>.
              </p>
            {/if}

            <p class="text-[length:var(--nt-chrome-font-sm)] text-muted leading-snug">
              Notron runs the selected configuration in the integrated terminal.<br />
              Shortcuts: F5 run · Ctrl+F5 current file · Shift+F5 stop.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .link-button {
    color: var(--accent);
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }

  .link-button:hover {
    text-decoration: underline;
  }
</style>
