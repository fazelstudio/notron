<script lang="ts">
  import Modal from '../common/Modal.svelte';
  import Select from '../common/Select.svelte';
  import {
    SlidersHorizontal,
    Palette,
    Code,
    FileText,
    Search,
    FolderTree,
    SquareTerminal,
  } from 'lucide-svelte';
  import { settingsRegistry } from '../../workbench/settingsRegistry';
  import { settingsStore } from '../../stores/settings.svelte';
  import { themeStore } from '../../stores/theme';
  import { uiStore } from '../../stores/ui';
  import { terminalStore } from '../../stores/terminal';
  import { __getContributedIconThemes } from '../../../../packages/notron-sdk/src/api/theming';
  import { getThemeOptions } from '../../theme/registry';
  import {
    MIN_SIDEBAR_WIDTH,
    MAX_SIDEBAR_WIDTH,
    MIN_TERMINAL_HEIGHT,
    TERMINAL_BOTTOM_MARGIN,
    SHELL_DISPLAY_NAMES,
  } from '../../constants';
  import { getPlatformShells } from '../../utils/platform';

  let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();

  let activeSection = $state('appearance');
  let searchQuery = $state('');
  let searchInputEl: HTMLInputElement | undefined = $state();

  // Settings currently overridden for this workspace (the editor style):
  // rows carrying a workspace value show a badge + "reset to user" action.
  const workspaceOverrides = $derived(new Set(Object.keys(settingsStore.rawWorkspaceSettings)));

  function handleSave(key: string, value: any) {
    // Update store immediately (synchronous) so UI reacts instantly
    settingsStore.updateSetting(key as any, value);
    // Apply theme directly - bypass the $effect chain in App.svelte
    if (key === 'theme') {
      themeStore.setTheme(value as string);
    }
  }

  // Terminal height slider max tracks the current viewport, mirroring the
  // clamp used by the terminal store (viewport height - bottom margin).
  const terminalHeightMax = Math.max(
    MIN_TERMINAL_HEIGHT + 100,
    (typeof window !== 'undefined' ? window.innerHeight : 700) - TERMINAL_BOTTOM_MARGIN
  );

  interface RowDef {
    id: string;
    label: string;
    description?: string;
    // Settings-store key; when set, the row shows the workspace-scope badge.
    key?: string;
    type: 'select' | 'toggle' | 'range' | 'text' | 'list';
    options?: string[] | { label: string; value: string }[];
    placeholder?: string;
    min?: number;
    max?: number;
    step?: number;
    format?: (v: number) => string;
    visible?: () => boolean;
    get: () => any;
    set: (v: any) => void;
    remove?: (v: string) => void;
  }

  interface SectionDef {
    id: string;
    label: string;
    description: string;
    // All lucide-svelte 0.510 icons share one structural type; SlidersHorizontal
    // is used here as the representative type for the icon slot.
    icon: typeof SlidersHorizontal;
    rows: RowDef[];
  }

  const baseSections: SectionDef[] = [
    {
      id: 'general',
      label: 'General',
      description: 'Application-wide behavior, integrations and default document views.',
      icon: SlidersHorizontal,
      rows: [
        {
          id: 'defaultSvgView',
          type: 'select',
          key: 'default_svg_view',
          label: 'Default SVG View',
          description: 'How SVG files open by default in the editor.',
          options: [
            { value: 'image', label: 'Image' },
            { value: 'code', label: 'Code' },
            { value: 'split', label: 'Split' },
          ],
          get: () => settingsStore.effectiveSettings.default_svg_view,
          set: (v) => handleSave('default_svg_view', v),
        },
        {
          id: 'defaultMdView',
          type: 'select',
          key: 'default_md_view',
          label: 'Default Markdown View',
          description: 'How Markdown files open by default in the editor.',
          options: [
            { value: 'preview', label: 'Preview' },
            { value: 'code', label: 'Code' },
            { value: 'split', label: 'Split' },
          ],
          get: () => settingsStore.effectiveSettings.default_md_view,
          set: (v) => handleSave('default_md_view', v),
        },
      ],
    },
    {
      id: 'appearance',
      label: 'Appearance',
      description: 'Customize the look and feel of the application.',
      icon: Palette,
      rows: [
        {
          id: 'theme',
          type: 'select',
          key: 'theme',
          label: 'Theme',
          description: 'Controls the overall color scheme of the application.',
          options: (() => {
            const opts = getThemeOptions().map(t => ({ value: t.id, label: t.label }));
            return [{ value: 'system', label: 'System Default' }, ...opts];
          })(),
          get: () => settingsStore.effectiveSettings.theme,
          set: (v) => handleSave('theme', v),
        },
        {
          id: 'fontFamily',
          type: 'text',
          key: 'font_family',
          label: 'Font Family',
          description: 'The font used in the code editor. Separate with commas for fallbacks.',
          placeholder: 'JetBrains Mono, Consolas, monospace',
          get: () => settingsStore.effectiveSettings.font_family,
          set: (v) => handleSave('font_family', v),
        },
        {
          id: 'fontSize',
          type: 'range',
          key: 'font_size',
          label: 'Font Size',
          description: 'The font size used in the editor.',
          min: 10,
          max: 32,
          step: 1,
          get: () => settingsStore.effectiveSettings.font_size,
          set: (v) => handleSave('font_size', v),
          format: (v) => `${v}px`,
        },
        {
          id: 'iconTheme',
          type: 'select',
          key: 'icon_theme',
          label: 'Icon Theme',
          description: 'File icons displayed in the explorer sidebar.',
          options: (() => {
            const contributed = __getContributedIconThemes();
            const all = [{ id: 'off', label: 'None' }, { id: 'default', label: 'Default (Lucide)' }, ...contributed.map(c => ({ id: c.id, label: c.label }))];
            const seen = new Set<string>();
            return all.filter(o => {
              if (seen.has(o.id)) return false;
              seen.add(o.id);
              return true;
            }).map(o => ({ value: o.id, label: o.label }));
          })(),
          get: () => settingsStore.effectiveSettings.icon_theme || 'default',
          set: (v) => handleSave('icon_theme', v),
        },
      ],
    },
    {
      id: 'editor',
      label: 'Editor',
      description: 'Code editor behavior and typing experience.',
      icon: Code,
      rows: [
        {
          id: 'tabSize',
          type: 'range',
          key: 'tab_size',
          label: 'Tab Size',
          description: 'Number of spaces inserted when pressing Tab.',
          min: 2,
          max: 8,
          step: 1,
          get: () => settingsStore.effectiveSettings.tab_size,
          set: (v) => handleSave('tab_size', v),
          format: (v) => String(v),
        },
        {
          id: 'wordWrap',
          type: 'toggle',
          key: 'word_wrap',
          label: 'Word Wrap',
          description: 'Wrap long lines that exceed the editor width.',
          get: () => settingsStore.effectiveSettings.word_wrap,
          set: (v) => handleSave('word_wrap', v),
        },
        {
          id: 'lineNumbers',
          type: 'toggle',
          key: 'line_numbers',
          label: 'Line Numbers',
          description: 'Show or hide line numbers in the editor gutter.',
          get: () => settingsStore.effectiveSettings.line_numbers,
          set: (v) => handleSave('line_numbers', v),
        },
        {
          id: 'minimap',
          type: 'toggle',
          label: 'Minimap',
          description: 'Show a minimap overview of the file on the right side of the editor.',
          get: () => $uiStore.isMinimapEnabled,
          set: (v) => uiStore.setMinimapEnabled(v),
        },
        {
          id: 'breadcrumbs',
          type: 'toggle',
          label: 'Breadcrumbs',
          description: 'Show the breadcrumb navigation bar below the tab strip.',
          get: () => $uiStore.isBreadcrumbsEnabled,
          set: (v) => uiStore.setBreadcrumbsEnabled(v),
        },
        {
          id: 'stickyScroll',
          type: 'toggle',
          label: 'Sticky Scroll',
          description: 'Pin the enclosing scope header (function, class, etc.) at the top of the editor while scrolling.',
          get: () => $uiStore.isStickyScrollEnabled,
          set: (v) => uiStore.setStickyScrollEnabled(v),
        },
        {
          id: 'statusBar',
          type: 'toggle',
          label: 'Status Bar',
          description: 'Show or hide the status bar at the bottom of the window.',
          get: () => $uiStore.isStatusBarEnabled,
          set: (v) => uiStore.setStatusBarEnabled(v),
        },
      ],
    },
    {
      id: 'files',
      label: 'Files',
      description: 'File handling, encoding and auto-save.',
      icon: FileText,
      rows: [
        {
          id: 'defaultEncoding',
          type: 'select',
          key: 'default_encoding',
          label: 'Default Encoding',
          description: 'The character encoding used when reading and writing files.',
          options: ['UTF-8', 'UTF-16', 'ISO-8859-1'],
          get: () => settingsStore.effectiveSettings.default_encoding,
          set: (v) => handleSave('default_encoding', v),
        },
        {
          id: 'autoSave',
          type: 'toggle',
          key: 'auto_save',
          label: 'Enable Auto Save',
          description: 'Automatically save modified files after a delay.',
          get: () => settingsStore.effectiveSettings.auto_save,
          set: (v) => handleSave('auto_save', v),
        },
        {
          id: 'autoSaveDelay',
          type: 'range',
          key: 'auto_save_delay_ms',
          label: 'Auto Save Delay',
          description: 'How long to wait after the last change before auto-saving.',
          min: 500,
          max: 10000,
          step: 500,
          visible: () => settingsStore.effectiveSettings.auto_save,
          get: () => settingsStore.effectiveSettings.auto_save_delay_ms,
          set: (v) => handleSave('auto_save_delay_ms', v),
          format: (v) => `${v}ms`,
        },
      ],
    },
    {
      id: 'search',
      label: 'Search',
      description: 'Global search and quick open behavior.',
      icon: Search,
      rows: [
        {
          id: 'searchExclude',
          type: 'list',
          key: 'search_exclude',
          label: 'Search Exclude',
          description:
            'Patterns excluded from Global Search & Quick Open. They stay visible in the Explorer, expandable manually. Matches .gitignore syntax.',
          placeholder: 'e.g. **/*.min.js',
          get: () => settingsStore.effectiveSettings.search_exclude,
          set: (v) => settingsStore.addSearchExclude(v),
          remove: (v) => settingsStore.removeSearchExclude(v),
        },
        {
          id: 'searchInclude',
          type: 'list',
          key: 'search_include',
          label: 'Search Include',
          description:
            'Re-include patterns that the app defaults would otherwise exclude from Search (e.g. "target" to search Rust build output).',
          placeholder: 'e.g. target',
          get: () => settingsStore.effectiveSettings.search_include,
          set: (v) => settingsStore.addSearchInclude(v),
          remove: (v) => settingsStore.removeSearchInclude(v),
        },
      ],
    },
    {
      id: 'explorer',
      label: 'Explorer',
      description: 'File explorer, sidebar and workspace browsing.',
      icon: FolderTree,
      rows: [
        {
          id: 'showDotFiles',
          type: 'toggle',
          label: 'Show Dot Files',
          description: 'Show hidden files and folders (e.g. .gitignore) in the Explorer.',
          get: () => $uiStore.showDotFiles,
          set: () => uiStore.toggleShowDotFiles(),
        },
        {
          id: 'sidebarWidth',
          type: 'range',
          label: 'Sidebar Width',
          description: 'Width of the activity sidebar in pixels.',
          min: MIN_SIDEBAR_WIDTH,
          max: MAX_SIDEBAR_WIDTH,
          step: 10,
          get: () => $uiStore.sidebarWidth,
          set: (v) => uiStore.setSidebarWidth(v),
          format: (v) => `${v}px`,
        },
      ],
    },
    {
      id: 'terminal',
      label: 'Terminal',
      description: 'Integrated terminal behavior.',
      icon: SquareTerminal,
      rows: [
        {
          id: 'defaultShell',
          type: 'select',
          key: 'default_shell',
          label: 'Default Shell',
          description: 'The shell used when opening a new integrated terminal.',
          options: getPlatformShells().map((t) => ({ value: t, label: SHELL_DISPLAY_NAMES[t] })),
          get: () => settingsStore.effectiveSettings.default_shell,
          set: (v) => handleSave('default_shell', v),
        },
        {
          id: 'terminalHeight',
          type: 'range',
          label: 'Terminal Height',
          description: 'Default height of the integrated terminal panel.',
          min: MIN_TERMINAL_HEIGHT,
          max: terminalHeightMax,
          step: 10,
          get: () => $terminalStore.height,
          set: (v) => terminalStore.setHeight(v),
          format: (v) => `${v}px`,
        },
      ],
    },
  ];
  // Settings declared in the schema registry but not hand-rendered by a section
  // are produced automatically, so a new setting is one registration.
  const coveredKeys = new Set(
    baseSections.flatMap((s) => s.rows.map((r) => r.key).filter((k): k is string => !!k))
  );

  function registryRows(sectionId: string): RowDef[] {
    return settingsRegistry
      .getByCategory(sectionId)
      .filter((schema) => !coveredKeys.has(schema.key))
      .map((schema) => ({
        id: `schema-${schema.key}`,
        type: (schema.type === 'boolean'
          ? 'toggle'
          : schema.type === 'enum'
            ? 'select'
            : schema.type === 'number'
              ? 'range'
              : 'text') as RowDef['type'],
        key: schema.key,
        label: schema.title ?? schema.key,
        description: schema.description,
        options: schema.enum,
        min: schema.min,
        max: schema.max,
        step: schema.step,
        get: () => (settingsStore.effectiveSettings as Record<string, any>)[schema.key],
        set: (v) => handleSave(schema.key, v),
        visible: schema.when,
      }));
  }

  const sections: SectionDef[] = $derived(
    baseSections.map((s) => ({ ...s, rows: [...s.rows, ...registryRows(s.id)] }))
  );


  const searchableRows = $derived(
    sections.flatMap((s) =>
      s.rows.map((r) => ({ id: r.id, label: r.label, section: s.id, sectionLabel: s.label }))
    )
  );

  const filteredResults = $derived.by(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.trim().toLowerCase();
    return searchableRows.filter((r) => r.label.toLowerCase().includes(q));
  });

  $effect(() => {
    if (isOpen) {
      searchQuery = '';
      requestAnimationFrame(() => searchInputEl?.focus());
    }
  });

  function scrollToSetting(id: string) {
    const row = searchableRows.find((r) => r.id === id);
    if (!row) return;
    activeSection = row.section;
    // Wait a frame so the section renders before scrolling to the row.
    requestAnimationFrame(() => {
      document.getElementById(`setting-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    searchQuery = '';
  }
</script>

{#snippet scopeBadge(key: string)}
  {#if workspaceOverrides.has(key)}
    <span class="mt-1.5 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-subtle bg-elevated text-secondary" title="Overridden in workspace settings">
      <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      Workspace
      <button
        aria-label={`Reset ${key} to user settings`}
        title="Reset to user (global) settings"
        onclick={() => settingsStore.resetToGlobal(key as any)}
        class="hover:text-primary transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      </button>
    </span>
  {/if}
{/snippet}

{#snippet rowLabel(p: RowDef)}
  <label for={p.id} class="font-medium text-primary text-sm block">{p.label}</label>
  {#if p.description}
    <p class="text-xs text-muted mt-0.5 leading-relaxed max-w-lg">{p.description}</p>
  {/if}
  {#if p.key}
    {@render scopeBadge(p.key)}
  {/if}
{/snippet}

{#snippet toggleRow(p: RowDef)}
  <div id={`setting-${p.id}`} class="flex items-center justify-between gap-6 py-3">
    <div class="min-w-0 flex-1">
      {@render rowLabel(p)}
    </div>
    <button
      id={p.id}
      role="switch"
      aria-label={`Toggle ${p.label}`}
      aria-checked={p.get()}
      onclick={() => p.set(!p.get())}
      class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors {p.get() ? 'bg-accent' : 'bg-elevated border border-subtle'}"
    >
      <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-editor shadow transition-transform {p.get() ? 'translate-x-4' : 'translate-x-0.5'}"></span>
    </button>
  </div>
{/snippet}

{#snippet selectRow(p: RowDef)}
  <div id={`setting-${p.id}`} class="flex items-center justify-between gap-6 py-3">
    <div class="min-w-0 flex-1">
      {@render rowLabel(p)}
    </div>
    <Select
      id={p.id}
      class="w-44 shrink-0"
      options={p.options ?? []}
      value={p.get()}
      onchange={(v) => p.set(v)}
    />
  </div>
{/snippet}

{#snippet rangeRow(p: RowDef)}
  <div id={`setting-${p.id}`} class="flex items-center justify-between gap-6 py-3">
    <div class="min-w-0 flex-1">
      {@render rowLabel(p)}
    </div>
    <div class="flex items-center gap-3 w-48 shrink-0">
      <input
        id={p.id}
        type="range"
        min={p.min}
        max={p.max}
        step={p.step ?? 1}
        class="flex-1 min-w-0"
        value={p.get()}
        oninput={(e) => p.set(parseInt((e.target as HTMLInputElement).value, 10))}
      />
      <span class="text-xs text-muted w-12 text-right tabular-nums shrink-0">{p.format ? p.format(p.get()) : p.get()}</span>
    </div>
  </div>
{/snippet}

{#snippet textRow(p: RowDef)}
  <div id={`setting-${p.id}`} class="flex items-center justify-between gap-6 py-3">
    <div class="min-w-0 flex-1">
      {@render rowLabel(p)}
    </div>
    <input
      id={p.id}
      type="text"
      placeholder={p.placeholder}
      class="rounded p-1.5 text-sm outline-none w-56 shrink-0 border bg-editor border-subtle text-primary placeholder-muted focus:border-focus"
      value={p.get()}
      oninput={(e) => p.set((e.target as HTMLInputElement).value)}
    />
  </div>
{/snippet}

{#snippet listRow(p: RowDef)}
  <div id={`setting-${p.id}`} class="py-3">
    {@render rowLabel(p)}
    <div class="flex gap-2 mt-2.5">
      <input
        id={p.id}
        type="text"
        placeholder={p.placeholder}
        class="flex-1 rounded p-1.5 text-sm outline-none border bg-editor border-subtle text-primary placeholder-muted focus:border-focus"
        onkeydown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
            p.set((e.target as HTMLInputElement).value.trim());
            (e.target as HTMLInputElement).value = '';
          }
        }}
      />
      <button
        onclick={() => {
          const input = document.getElementById(p.id) as HTMLInputElement | null;
          if (input?.value.trim()) {
            p.set(input.value.trim());
            input.value = '';
          }
        }}
        class="px-3 py-1.5 text-sm rounded border border-subtle bg-elevated text-primary hover:bg-hover transition-colors"
      >Add</button>
    </div>
    <div class="mt-2.5 flex flex-wrap gap-1.5">
      {#each p.get() as pattern (pattern)}
        <span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-subtle bg-elevated text-secondary">
          {pattern}
          <button
            aria-label={`Remove ${pattern}`}
            onclick={() => p.remove?.(pattern)}
            class="text-muted hover:text-primary transition-colors"
          >×</button>
        </span>
      {/each}
    </div>
  </div>
{/snippet}

<Modal
  {isOpen}
  title="Settings"
  {onClose}
  widthClass="max-w-[80vw] min-w-[min(480px,96vw)]"
  heightClass="h-[80vh]"
>
  {#snippet children()}
    <div class="flex h-full overflow-hidden">
      <!-- Sidebar -->
      <aside class="w-44 lg:w-52 xl:w-56 shrink-0 border-r border-subtle flex flex-col py-2 overflow-y-auto">
        <div class="px-4 py-1.5 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">Settings</div>
        {#each sections as sec (sec.id)}
          {@const active = activeSection === sec.id}
          {@const Icon = sec.icon}
          <button
            onclick={() => activeSection = sec.id}
            class="relative flex items-center gap-2.5 px-3 py-2 text-sm rounded mx-1.5 my-0.5 transition-colors text-left"
            class:bg-selected={active}
            class:text-primary={active}
            class:text-secondary={!active}
            class:hover:bg-hover={!active}
          >
            <span
              class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r bg-accent transition-opacity {active ? 'opacity-100' : 'opacity-0'}"
              aria-hidden="true"
            ></span>
            <Icon size={14} class="shrink-0" strokeWidth={2} />
            <span class="truncate">{sec.label}</span>
          </button>
        {/each}
      </aside>

      <!-- Main content -->
      <div class="flex-1 flex flex-col overflow-hidden min-w-0">
        <!-- Search bar -->
        <div class="px-4 py-3 border-b border-subtle shrink-0">
          <div class="relative max-w-xs">
            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" size={13} />
            <input
              bind:this={searchInputEl}
              type="text"
              placeholder="Search settings..."
              bind:value={searchQuery}
              class="w-full pl-8 pr-3 py-1.5 text-sm rounded outline-none border bg-editor border-subtle text-primary placeholder-muted focus:border-focus"
            />
            {#if filteredResults && filteredResults.length > 0}
              <div class="absolute top-full left-0 right-0 mt-1 rounded border border-subtle bg-elevated shadow-elevated overflow-hidden z-50 max-h-72 overflow-y-auto">
                {#each filteredResults as result (result.id)}
                  <button
                    onclick={() => scrollToSetting(result.id)}
                    class="w-full text-left px-3 py-2 text-sm hover:bg-hover text-secondary hover:text-primary transition-colors flex items-center gap-2"
                  >
                    <Search size={12} class="shrink-0 text-muted" />
                    <span class="truncate">{result.label}</span>
                    <span class="ml-auto text-xs text-muted capitalize shrink-0">{result.sectionLabel}</span>
                  </button>
                {/each}
              </div>
            {:else if searchQuery.trim() && filteredResults?.length === 0}
              <div class="absolute top-full left-0 right-0 mt-1 rounded border border-subtle bg-elevated shadow-elevated overflow-hidden z-50">
                <div class="px-3 py-2 text-sm text-muted">No settings found for "{searchQuery}"</div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Settings content -->
        <div class="flex-1 overflow-y-auto min-h-0">
          <div class="px-3.5 py-4 space-y-2">
            {#each sections as sec (sec.id)}
              {#if activeSection === sec.id}
                <div class="space-y-1 mb-4">
                  <h3 class="text-lg font-semibold text-primary">{sec.label}</h3>
                  <p class="text-xs text-muted">{sec.description}</p>
                </div>
                <div class="divide-y divide-subtle">
                  {#each sec.rows as row (row.id)}
                    {#if (row.visible?.() ?? true)}
                      {#if row.type === 'toggle'}
                        {@render toggleRow(row)}
                      {:else if row.type === 'select'}
                        {@render selectRow(row)}
                      {:else if row.type === 'range'}
                        {@render rangeRow(row)}
                      {:else if row.type === 'text'}
                        {@render textRow(row)}
                      {:else if row.type === 'list'}
                        {@render listRow(row)}
                      {/if}
                    {/if}
                  {/each}
                </div>
              {/if}
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/snippet}
</Modal>
