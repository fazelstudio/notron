<!--
 * Search Panel
 *
 * Global search and replace across the workspace.
-->

<script module lang="ts">
  // SearchLineMatch mirrors src-tauri/src/search.rs — `start`/`end` are byte
  // offsets relative to `text` (the trimmed line); `isContext` marks lines
  // emitted for context, not real matches.
  export interface SearchLineMatch { line: number; start: number; end: number; text: string; isContext?: boolean; }
  export interface SearchFileItem { path: string; displayPath: string; fileName: string; matchCount: number; matches: SearchLineMatch[]; }
  export interface DisplayRow {
    key: string;
    type: 'file' | 'match';
    path: string;
    matchCount?: number;
    excluded?: boolean;
    res?: SearchLineMatch;
  }

  let cachedResults: SearchFileItem[] = [];
  let cachedFilesScanned = 0;
  let cachedMatchesFound = 0;
  let cachedQuery = '';
  let cachedRoot: string | null = null;
</script>

<script lang="ts">
  import { eventBus } from '../../utils/eventBus';
    import { uiStore } from '../../stores/ui';
  import { editorStore } from '../../stores/editor';
  import { invoke } from '@tauri-apps/api/core';
  import { onDestroy, untrack } from 'svelte';
  import { streamCommand } from '../../utils/stream';
  import { SEARCH_DEBOUNCE_MS } from '../../constants';
  import { 
    Replace, ChevronDown, ChevronRight, X, 
    Loader2, CaseSensitive, WholeWord
  } from 'lucide-svelte';
  import Tooltip from '../common/Tooltip.svelte';
  import Modal from '../common/Modal.svelte';
  import VirtualList from '../common/VirtualList.svelte';
  import FileIcon from '../common/FileIcon.svelte';

  // Cap total matches so the backend scan stops early and the UI never
  // accumulates unbounded results (matches the Rust MAX default of 10k).
  const MAX_RESULTS = 10000;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  let isReplaceVisible = $state(false);
  let showReplaceModal = $state(false);
  const ui = uiStore;
  
  let searchQuery = $state($ui.searchQuery);
  let replaceQuery = $state($ui.replaceQuery);
  let historyIndex = $state(-1); // SEARCH-010: current position in search history

  let caseSensitive = $state(false);
  let wholeWord = $state(false);
  let excludedFiles = $state<Set<string>>(new Set());
  
  let results = $state<SearchFileItem[]>(cachedResults);
  let isSearching = $state(false);
  let filesScanned = $state(cachedFilesScanned);
  let matchesFound = $state(cachedMatchesFound);
  let lastOptionKey = $state('00');

  $effect(() => {
    cachedResults = results;
    cachedFilesScanned = filesScanned;
    cachedMatchesFound = matchesFound;
    
    const count = results.reduce((n, f) => n + f.matchCount, 0);
    untrack(() => {
      if (uiStore.getSnapshot().searchResultCount !== count) {
        uiStore.setSearchResultCount(count);
      }
    });
  });

  let lastRefreshCounter = $state($ui.searchRefreshCounter);
  let lastCollapseCounter = $state($ui.searchCollapseCounter);

  $effect(() => {
    const refreshCount = $ui.searchRefreshCounter;
    if (refreshCount > lastRefreshCounter) {
      lastRefreshCounter = refreshCount;
      untrack(() => {
        if (searchQuery.trim().length > 0 && !isSearching) {
          startSearch(searchQuery, true);
        }
      });
    }
  });

  $effect(() => {
    const collapseCount = $ui.searchCollapseCounter;
    if (collapseCount > lastCollapseCounter) {
      lastCollapseCounter = collapseCount;
      untrack(() => {
        collapsedFiles = new Set(results.map(f => f.path));
      });
    }
  });

  let collapsedFiles = $state<Set<string>>(new Set());

  function toggleFileCollapse(path: string, e: Event) {
    e.stopPropagation();
    const newSet = new Set(collapsedFiles);
    if (newSet.has(path)) newSet.delete(path);
    else newSet.add(path);
    collapsedFiles = newSet;
  }

  function toggleExclude(path: string, e: Event) {
    e.stopPropagation();
    const newSet = new Set(excludedFiles);
    if (newSet.has(path)) newSet.delete(path);
    else newSet.add(path);
    excludedFiles = newSet;
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let currentCancelToken: string | null = null;

  // Debounced search with streaming; re-runs when query or match options change.
  $effect(() => {
    const q = searchQuery;
    const rq = replaceQuery;
    const root = untrack(() => $ui.explorerRoot);
    const cs = caseSensitive;
    const ww = wholeWord;

 // The part-level result cache is scoped to ONE workspace root. On a
    // workspace switch the stale results must never be shown for the new root.
    if (root !== cachedRoot) {
      cachedRoot = root;
      cachedResults = [];
      cachedFilesScanned = 0;
      cachedMatchesFound = 0;
      cachedQuery = '';
      lastOptionKey = '00';
      if (!untrack(() => isSearching)) {
        results = [];
        filesScanned = 0;
        matchesFound = 0;
      }
    }

    clearTimeout(debounceTimer);
    if (q.trim().length > 0 && root) {
      const optKey = `${cs ? '1' : '0'}${ww ? '1' : '0'}`;
      if (q === cachedQuery && untrack(() => results.length) > 0 && optKey === lastOptionKey) {
        // Already cached for this root — keep the results without re-searching
        // (mirrors the editor: switching away and back does not re-run the query).
        if (untrack(() => uiStore.getSnapshot().searchQuery) !== q) uiStore.setSearchQuery(q);
        if (untrack(() => uiStore.getSnapshot().replaceQuery) !== rq) uiStore.setReplaceQuery(rq);
      } else {
        debounceTimer = setTimeout(() => {
          if (untrack(() => uiStore.getSnapshot().searchQuery) !== q) uiStore.setSearchQuery(q);
          if (untrack(() => uiStore.getSnapshot().replaceQuery) !== rq) uiStore.setReplaceQuery(rq);
          startSearch(q);
        }, SEARCH_DEBOUNCE_MS);
      }
    } else {
      handleCancel();
      if (untrack(() => uiStore.getSnapshot().searchQuery) !== q) uiStore.setSearchQuery(q);
      if (untrack(() => uiStore.getSnapshot().replaceQuery) !== rq) uiStore.setReplaceQuery(rq);
      results = [];
      filesScanned = 0;
      matchesFound = 0;
    }
    return () => clearTimeout(debounceTimer);
  });

  async function startSearch(query: string, quietRefresh = false) {
    // Supersede the previous search without waiting on it — awaiting can stall
    // on a search that never registered, and once its token is stale the old
    // stream's batches/done are dropped by the `stale()` guard anyway.
    const supersededToken = currentCancelToken;
    currentCancelToken = null;
    if (supersededToken) {
      invoke('cancel_search', { token: supersededToken }).catch(() => {});
    }

    // Snapshot the workspace this search targets. Batches arriving after a
    // workspace switch (see the root guard in the debounce effect) are dropped
    // so stale results never leak into the new workspace.
    const searchRoot = untrack(() => $ui.explorerRoot);

    if (!quietRefresh) {
      results = [];
      filesScanned = 0;
      matchesFound = 0;
    }

    isSearching = true;
    cachedQuery = query;
    cachedRoot = searchRoot;
    lastOptionKey = `${caseSensitive ? '1' : '0'}${wholeWord ? '1' : '0'}`;
    currentCancelToken = crypto.randomUUID();
    const token = currentCancelToken;

    const stale = () => searchRoot !== untrack(() => cachedRoot) || token !== currentCancelToken;

    try {
      await streamCommand<SearchFileItem>(
        'search_files_stream',
        {
          options: {
            query,
            caseSensitive,
            useRegex: false,
            wholeWord,
            dotFiles: untrack(() => $ui.showDotFiles),
            contextLines: 0,
          },
          workspacePath: searchRoot,
          maxResults: MAX_RESULTS,
          maxFileSize: MAX_FILE_SIZE,
          cancelToken: token,
        },
        {
          onBatch: (batchItems, meta) => {
            if (stale()) return;
            if (quietRefresh) {
              results = [];
              filesScanned = 0;
              matchesFound = 0;
            }
            if (batchItems.length > 0) {
              const totalSoFar = results.reduce((n, f) => n + f.matchCount, 0);
              const remaining = MAX_RESULTS - totalSoFar;
              if (remaining > 0) {
                let added = 0;
                for (const item of batchItems) {
                  if (added >= remaining) break;
                  results.push(item);
                  added += item.matchCount;
                }
              } else {
                // Cap reached — cancel the backend scan to stop wasted I/O.
                // The token is nulled so this stream's onDone is stale; settle
                // the UI here or the "Searching…" spinner would never clear.
                invoke('cancel_search', { token }).catch(() => {});
                currentCancelToken = null;
                isSearching = false;
              }
            }
            filesScanned = meta.files_scanned ?? filesScanned;
            matchesFound = meta.matches_found ?? matchesFound;
          },
          onDone: (meta) => {
            if (stale()) {
              // A newer search or a workspace change superseded this one
              // never report its final counts.
              if (token === currentCancelToken) currentCancelToken = null;
              return;
            }
            if (quietRefresh) {
              results = [];
            }
            filesScanned = meta.files_scanned ?? filesScanned;
            matchesFound = meta.matches_found ?? matchesFound;
            isSearching = false;
            currentCancelToken = null;
          },
        },
      );
    } catch (err) {
      console.error(err);
      if (token === currentCancelToken) {
        isSearching = false;
        currentCancelToken = null;
      }
    }
  }

  function handleCancel() {
    if (currentCancelToken) {
      invoke('cancel_search', { token: currentCancelToken }).catch(console.error);
      currentCancelToken = null;
    }
    isSearching = false;
  }

  let fileCount = $derived(results.length);

  // Results arrive already grouped per-file (SearchFileItem), so each file
  // becomes one header row followed by its match rows. Collapsed files only
  // emit their header; excluded files are dimmed and skipped by Replace All.
  let displayRows = $derived.by(() => {
    const rows: DisplayRow[] = [];
    for (const f of results) {
      const isExcluded = excludedFiles.has(f.path);
      rows.push({ key: `file:${f.path}`, type: 'file', path: f.path, matchCount: f.matchCount, excluded: isExcluded });
      if (collapsedFiles.has(f.path)) continue;
      for (let i = 0; i < f.matches.length; i++) {
        rows.push({ key: `match:${f.path}:${f.matches[i].line}:${i}`, type: 'match', path: f.path, res: f.matches[i] });
      }
    }
    return rows;
  });

  // Convert a byte offset (Rust grep reports byte offsets) into a character
  // index inside the preview string, so CodeMirror columns stay correct even
  // for non-ASCII lines.
  function byteToCharIndex(str: string, byteIndex: number): number {
    let charIdx = 0;
    let bytePos = 0;
    for (const ch of str) {
      if (bytePos >= byteIndex) break;
      bytePos += new TextEncoder().encode(ch).length;
      charIdx++;
    }
    return charIdx;
  }

  async function executeReplaceAll() {
    showReplaceModal = false;
    if (!searchQuery) return;

    const replaceOpts = {
      query: searchQuery,
      replace: replaceQuery ?? '',
      caseSensitive,
      useRegex: false,
      wholeWord,
    };

    // Target files: every result file minus the excluded ones.
    const targetPaths = results.filter(f => !excludedFiles.has(f.path)).map(f => f.path);
    if (targetPaths.length === 0) return;

    const tabs = editorStore.getTabsSnapshot();
    const openByPath = new Map<string, string>(); // path -> tabId (content loaded in memory)
    for (const t of tabs) {
      if (t.path && t.content !== null && !openByPath.has(t.path)) openByPath.set(t.path, t.id);
    }
    const activeTabId = editorStore.getActiveTabIdSnapshot();
    const activePath = tabs.find(t => t.id === activeTabId)?.path ?? null;

    const closed: string[] = [];

    for (const path of targetPaths) {
      const tabId = openByPath.get(path);
      if (tabId === undefined) {
        // Not open in memory → Rust re-reads, re-scans and atomically rewrites disk.
        closed.push(path);
      } else if (path === activePath) {
        // Live view → single CodeMirror transaction (undo-able); the editor's
        // updateListener marks it dirty and auto-saves through the normal path.
        eventBus.emit('editor:action', { action: 'replaceAll', path, options: replaceOpts });
      } else {
        editorStore.applyReplacements(path, replaceOpts);
      }
    }

    if (closed.length > 0) {
      isSearching = true;
      // The Rust command returns as soon as the blocking work is spawned, so
      // the "in progress" state is driven by the final `done` frame instead of
      // the invoke promise resolving.
      await new Promise<void>((resolve) => {
        streamCommand(
          'replace_all_files',
          {
            options: {
              query: replaceOpts.query,
              replace: replaceOpts.replace,
              caseSensitive,
              useRegex: false,
              wholeWord,
            },
            files: closed,
          },
          {
            onBatch: () => {},
            onDone: () => resolve(),
          },
        ).catch(() => resolve());
      });
      isSearching = false;
    }

    uiStore.addToast(
      `Replace All complete`,
      'success',
      `${targetPaths.length} file(s), ${closed.length} written on disk, ${targetPaths.length - closed.length} open in editor.`,
    );

 // Invalidate the part-level cache too — a stale copy must not be shown
    // again when the panel is re-mounted (the replaced text no longer matches).
    cachedResults = [];
    cachedFilesScanned = 0;
    cachedMatchesFound = 0;
    cachedQuery = '';
    lastOptionKey = '00';

    searchQuery = '';
    replaceQuery = '';
    results = [];
    filesScanned = 0;
    matchesFound = 0;
  }

  onDestroy(() => {
    if (currentCancelToken) {
      invoke('cancel_search', { token: currentCancelToken }).catch(() => {});
      currentCancelToken = null;
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchQuery.trim().length > 0) {
        // SEARCH-010: save to history before searching
        uiStore.addSearchHistory(searchQuery);
        historyIndex = -1;
        if (untrack(() => uiStore.getSnapshot().searchQuery) !== searchQuery) uiStore.setSearchQuery(searchQuery);
        startSearch(searchQuery);
      }
    } else if (e.key === 'ArrowUp') {
      // SEARCH-010: navigate up in search history
      const history = uiStore.getSearchHistorySnapshot();
      if (history.length === 0) return;
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        historyIndex++;
        searchQuery = history[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      // SEARCH-010: navigate down in search history
      const history = uiStore.getSearchHistorySnapshot();
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        searchQuery = history[historyIndex];
      } else {
        historyIndex = -1;
        searchQuery = '';
      }
    }
  }

  // Build highlight segments from the BACKEND match offsets (res.start/end),
  // not by re-searching the line — the backend already applied match-case and
  // whole-word rules, so the highlighted span always points at the true match
  // (a naive indexOf re-search mis-highlights under Match Case).
  function highlightMatchParts(res: SearchLineMatch) {
    const raw = res.text;
    const trimmed = raw.trim();
    if (raw.length === 0) return [{ text: '', isMatch: false }];

    let s = byteToCharIndex(raw, res.start);
    let e = byteToCharIndex(raw, res.end);
    if (e <= s) return [{ text: trimmed, isMatch: false }];

    // Offset the match into the trimmed (display) string. Leading whitespace
    // is a character prefix, so subtracting its char count realigns offsets.
    const leadingWs = raw.length - raw.trimStart().length;
    s = Math.max(s - leadingWs, 0);
    e = Math.max(e - leadingWs, 0);
    if (e > trimmed.length) e = trimmed.length;
    if (s >= trimmed.length) return [{ text: trimmed, isMatch: false }];

    // Crop the preview to a window around the match, like the editor.
    const WINDOW = 120;
    if (trimmed.length > WINDOW) {
      const startPos = Math.max(0, Math.min(s - 20, trimmed.length - WINDOW));
      const endPos = startPos + WINDOW;
      const prefixLen = startPos > 0 ? 1 : 0;
      const display = (startPos > 0 ? '…' : '') + trimmed.slice(startPos, endPos) + (endPos < trimmed.length ? '…' : '');
      s = s - startPos + prefixLen;
      e = Math.min(e - startPos + prefixLen, display.length);
      const parts = [];
      if (s > 0) parts.push({ text: display.slice(0, s), isMatch: false });
      if (e > s) parts.push({ text: display.slice(s, e), isMatch: true });
      if (e < display.length) parts.push({ text: display.slice(e), isMatch: false });
      return parts;
    }

    const parts = [];
    if (s > 0) parts.push({ text: trimmed.slice(0, s), isMatch: false });
    if (e > s) parts.push({ text: trimmed.slice(s, e), isMatch: true });
    if (e < trimmed.length) parts.push({ text: trimmed.slice(e), isMatch: false });
    return parts;
  }

  async function handleResultClick(path: string, res?: SearchLineMatch) {
    try {
      // Route through the central open handler — the tab appears in the active
      // pane immediately, content streams in from the background. Passing the
      // match position makes App jump straight to the result and highlight it
      // once the file is open (waiting until content is loaded, so the goto is
      // never dropped on a tab that is still loading).
      if (res && res.end > res.start) {
        // res.start/end are byte offsets into res.text (the full line, only
        // CRLF stripped) — convert to character columns for the goto action.
        // This stays correct for indented lines and Match Case searches.
        const s = byteToCharIndex(res.text, res.start);
        const e = byteToCharIndex(res.text, res.end);
        const startCol = Math.max(s, 0) + 1;
        const endCol = Math.max(e, s) + 1;
        eventBus.emit('request-open-file', { path, line: res.line, column: startCol, endColumn: endCol });
      } else {
        eventBus.emit('request-open-file', { path });
      }
    } catch (err) { console.error("Failed to open file from search", err); }
  }
</script>

<div class="flex flex-col p-2 gap-2 h-full text-primary">
  <div class="flex flex-col gap-1.5 shrink-0">
    <div class="flex items-start gap-1">
      <button aria-label="Toggle replace" onclick={() => isReplaceVisible = !isReplaceVisible} class="mt-1 p-0.5 rounded hover:bg-hover">
        {#if isReplaceVisible}
          <ChevronDown size={16} />
        {:else}
          <ChevronRight size={16} />
        {/if}
      </button>
      <div class="flex flex-col flex-1 gap-1.5 min-w-0">
        <div class="flex items-center flex-1 border rounded px-1.5 py-1 border-subtle bg-canvas focus-within:border-focus">
          <input id="global-search-input" type="text" placeholder="Search" bind:value={searchQuery} onkeydown={handleKeydown} oninput={() => { historyIndex = -1; }} class="flex-1 bg-transparent text-xs outline-none min-w-0 placeholder-muted" />
          <Tooltip content="Match Case" wrapperClass="shrink-0 flex items-center">
            <button aria-label="Match Case" class="p-0.5 rounded text-icon-default hover:text-icon-active hover:bg-hover {caseSensitive ? 'text-accent' : ''}" onclick={() => caseSensitive = !caseSensitive}>
              <CaseSensitive size={12} />
            </button>
          </Tooltip>
          <Tooltip content="Match Whole Word" wrapperClass="shrink-0 flex items-center ml-0.5">
            <button aria-label="Match Whole Word" class="p-0.5 rounded text-icon-default hover:text-icon-active hover:bg-hover {wholeWord ? 'text-accent' : ''}" onclick={() => wholeWord = !wholeWord}>
              <WholeWord size={12} />
            </button>
          </Tooltip>
          {#if isSearching}
            <button aria-label="Cancel search" onclick={handleCancel} class="p-0.5 rounded shrink-0 ml-1 text-icon-default hover:text-icon-active hover:bg-hover">
              <X size={12} />
            </button>
          {/if}
        </div>
        {#if isReplaceVisible}
        <div class="flex items-center flex-1 border rounded px-1.5 py-1 border-subtle bg-canvas focus-within:border-focus">
            <input type="text" placeholder="Replace" bind:value={replaceQuery} onkeydown={(e) => { if (e.key === 'Enter' && results.length > 0 && searchQuery !== replaceQuery) { e.preventDefault(); showReplaceModal = true; } }} class="flex-1 bg-transparent text-xs outline-none min-w-0 placeholder-muted" />
            <Tooltip content="Replace All" wrapperClass="ml-1 shrink-0 flex items-center">
              <button aria-label="Replace All" onclick={() => { if (results.length > 0) showReplaceModal = true; }} disabled={results.length === 0 || searchQuery === replaceQuery} class="p-0.5 rounded text-icon-default hover:text-icon-active hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed">
                <Replace size={12} />
              </button>
            </Tooltip>
          </div>
        {/if}
      </div>
    </div>
  </div>
  <div class="flex-1 overflow-y-auto mt-1 text-xs hover-scrollbar">
    {#if isSearching}
      <div class="flex items-center gap-2 px-6 text-xs text-muted">
        <Loader2 size={12} class="animate-spin" />
        <span>Searching... {filesScanned} files scanned, {matchesFound} matches found</span>
        <button onclick={handleCancel} class="underline ml-2 text-icon-default hover:text-icon-active">Cancel</button>
      </div>
    {:else if results.length > 0}
      <div class="text-xs px-6 pb-1 text-muted">{matchesFound} results in {fileCount} files</div>
      <VirtualList items={displayRows} itemHeight={24} getKey={(row) => row.key}>
        {#snippet item({ item })}
          {#if item.type === 'file'}
            {@const isCollapsed = collapsedFiles.has(item.path)}
            <div class="flex items-center gap-1.5 px-2 h-6 select-none group w-full overflow-hidden hover:bg-hover {item.excluded ? 'opacity-40' : ''}" role="treeitem" tabindex="0" aria-expanded={!isCollapsed} aria-selected="false" onclick={(e) => toggleFileCollapse(item.path, e)} onkeydown={(e) => { if (e.key === 'Enter') toggleFileCollapse(item.path, e); }}>
              <span class="shrink-0 text-muted {isCollapsed ? '-rotate-90' : ''}">
                <ChevronDown size={12} />
              </span>
              <span class="shrink-0 text-accent">
                <FileIcon name={item.path.split('/').pop() || ''} size={12} />
              </span>
              <Tooltip content={item.path} wrapperClass="truncate min-w-0 flex-1 flex items-center" followCursor={true} hoverDelay={2000}>
                <span class="text-xs truncate min-w-0 font-medium">{item.path.split(/[\/\\]/).pop()}</span>
              </Tooltip>
              <span class="text-[length:var(--nt-chrome-font-tip)] px-1 rounded-full shrink-0 bg-panel text-muted">{item.matchCount}</span>
              <button aria-label={item.excluded ? "Include file" : "Exclude file"} class="shrink-0 p-0.5 rounded text-icon-default opacity-0 group-hover:opacity-100 hover:text-icon-active hover:bg-hover" onclick={(e) => toggleExclude(item.path, e)}>
                <X size={12} />
              </button>
            </div>
          {:else}
            {@const res = item.res!}
            {@const isContext = !!res.isContext}
            {@const preview = isContext ? (res.text.trim() ? [{ text: res.text.trim(), isMatch: false }] : []) : highlightMatchParts(res)}
            <Tooltip content={res.text.trim()} wrapperClass="w-full block" followCursor={true} hoverDelay={2000}>
              <div class="flex items-start gap-2 pl-8 pr-2 h-6 py-[3px] text-xs group text-secondary hover:text-primary hover:bg-hover overflow-hidden {isContext ? 'opacity-60' : ''}" role="option" tabindex="0" aria-selected="false" onclick={() => handleResultClick(item.path, res)} onkeydown={(e) => { if (e.key === 'Enter') handleResultClick(item.path, res); }}>
                <span class="shrink-0 w-8 text-right select-none opacity-50 text-muted">{res.line}</span>
                <span class="truncate flex-1 group-hover:text-primary font-mono text-[11px] mt-[1px]">
                  {#each preview as part}
                    {#if part.isMatch}
                      <span class="border border-accent bg-accent/20 text-accent rounded-[2px] px-[1px]">{part.text}</span>
                    {:else}
                      {part.text}
                    {/if}
                  {/each}
                </span>
              </div>
            </Tooltip>
          {/if}
        {/snippet}
      </VirtualList>
    {:else if searchQuery.length > 0}
      <div class="px-6 text-xs text-muted">No results found.</div>
    {:else}
      <div class="px-6 text-xs text-muted">Type to search across workspace.</div>
    {/if}
  </div>
</div>

<Modal 
  isOpen={showReplaceModal} 
  title="Confirm Replace All" 
  onClose={() => showReplaceModal = false}
>
  <div class="p-2 flex flex-col gap-2">
    <p class="text-xs">Are you sure you want to replace all occurrences of <strong>{searchQuery}</strong> with <strong>{replaceQuery}</strong>?</p>
    <p class="text-xs text-muted">This will replace {matchesFound} matches across {fileCount} files. Hover a file and press <span class="font-mono">X</span> to exclude it from the operation.</p>
  </div>
  {#snippet footer()}
    <div class="flex justify-end gap-2 w-full">
      <button class="nt-control hover:bg-hover" onclick={() => showReplaceModal = false}>Cancel</button>
      <button class="nt-control bg-accent text-on-accent hover:bg-accent/90" onclick={executeReplaceAll}>Yes, Replace it</button>
    </div>
  {/snippet}
</Modal>
