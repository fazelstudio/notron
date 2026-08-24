<script lang="ts">
  import { X, ChevronUp, ChevronDown, Replace, ReplaceAll, CaseSensitive, WholeWord, Regex } from 'lucide-svelte';
  import { uiStore } from '../../stores/ui';
  import { untrack } from 'svelte';
  import { SearchQuery } from '@codemirror/search';
  import type { EditorView } from '@codemirror/view';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Tooltip from '../common/Tooltip.svelte';
  import { buildReplaceRegex, applyReplacement } from '../../utils/replace';

  let { editorView, onDocChanged, rightGap = 0, mode = 'find' }: {
    editorView: EditorView | null,
    onDocChanged: number,
    rightGap?: number,
    mode?: 'find' | 'replace',
  } = $props();

  let query = $state($uiStore.fileSearchQuery);
  let replaceQuery = $state($uiStore.fileReplaceQuery);
  let isReplaceVisible = $state(false);
  let caseSensitive = $state(false);
  let wholeWord = $state(false);
  let useRegex = $state(false);

  let matches = $state<{ from: number; to: number }[]>([]);
  let currentMatchIndex = $state(-1);
  let inputEl = $state<HTMLInputElement>();
  let replaceInputEl = $state<HTMLInputElement>();

  $effect(() => {
    uiStore.setFileSearchQuery(query);
  });

  $effect(() => {
    uiStore.setFileReplaceQuery(replaceQuery);
  });

  // Ctrl+H (or the Replace menu) opens the widget in replace mode: expand the
  // replace row and focus it, mirroring VSCode's "Replace" (Ctrl+H) command.
  $effect(() => {
    mode;
    if (mode === 'replace') {
      isReplaceVisible = true;
      setTimeout(() => replaceInputEl?.focus(), 10);
    }
  });

  let lastOptionKey = '';

  $effect(() => {
    const key = `${query}\u0001${caseSensitive ? '1' : '0'}\u0002${wholeWord ? '1' : '0'}\u0003${useRegex ? '1' : '0'}`;
    const keyChanged = key !== lastOptionKey;
    lastOptionKey = key;
    onDocChanged;

    untrack(() => {
      recalcMatches();
      // Only jump the cursor when the search term/options changed — never on
      // plain document edits (typing in the editor must not steal the cursor).
      if (keyChanged && matches.length > 0) {
        selectMatch(currentMatchIndex);
      }
    });
  });

  export function focusInput() {
    setTimeout(() => {
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    }, 50);
  }

  export function focusReplaceInput() {
    setTimeout(() => {
      if (replaceInputEl) {
        replaceInputEl.focus();
        replaceInputEl.select();
      }
    }, 50);
  }

  function buildSearchQuery(): SearchQuery | null {
    if (!query) return null;
    // literal: true keeps `\n`/`\t` as plain characters — identical to the
    // Rust backend's fixed-string matching used by global search.
    return new SearchQuery({
      search: query,
      caseSensitive,
      wholeWord,
      regexp: useRegex,
      literal: true,
    });
  }

  let isInvalidRegex = $derived(useRegex && query.length > 0 && !buildSearchQuery()!.valid);

  function recalcMatches() {
    if (!editorView || !query) {
      matches = [];
      currentMatchIndex = -1;
      return;
    }
    const searchQuery = buildSearchQuery();
    if (!searchQuery || !searchQuery.valid) {
      matches = [];
      currentMatchIndex = -1;
      return;
    }
    const doc = editorView.state.doc;
    const found: { from: number; to: number }[] = [];
    const cursor = searchQuery.getCursor(doc);
    let next = cursor.next();
    while (!next.done) {
      found.push({ from: next.value.from, to: next.value.to });
      next = cursor.next();
    }
    matches = found;

    if (matches.length > 0) {
      const pos = editorView.state.selection.main.head;
      let idx = matches.findIndex(m => m.from >= pos);
      if (idx === -1) idx = 0;
      currentMatchIndex = idx;
    } else {
      currentMatchIndex = -1;
    }
  }

  function selectMatch(index: number) {
    if (index >= 0 && index < matches.length && editorView) {
      const m = matches[index];
      editorView.dispatch({
        selection: { anchor: m.from, head: m.to },
        scrollIntoView: true
      });
    }
  }

  function nextMatch() {
    if (matches.length === 0) return;
    currentMatchIndex = (currentMatchIndex + 1) % matches.length;
    selectMatch(currentMatchIndex);
  }

  function prevMatch() {
    if (matches.length === 0) return;
    currentMatchIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
    selectMatch(currentMatchIndex);
  }

  /** Compute the replacement text for a match (regex backrefs honored, literal `$` escaped). */
  function computeReplacement(m: { from: number; to: number }): string {
    if (!editorView) return replaceQuery;
    const matchText = editorView.state.sliceDoc(m.from, m.to);
    const re = buildReplaceRegex(query, { caseSensitive, useRegex, wholeWord });
    return applyReplacement(matchText, re, { useRegex, replace: replaceQuery });
  }

  function replaceCurrent() {
    const m = matches[currentMatchIndex];
    if (!m || !editorView) return;
    const insert = computeReplacement(m);
    editorView.dispatch({
      changes: { from: m.from, to: m.to, insert },
      selection: { anchor: m.from, head: m.from + insert.length },
    });
    // The doc change recomputes matches and re-picks the match after the
    // replaced range; select it visually (VSCode "replace + advance" behavior).
    requestAnimationFrame(() => {
      if (currentMatchIndex >= 0 && currentMatchIndex < matches.length) {
        selectMatch(currentMatchIndex);
      }
    });
  }

  function replaceAllMatches() {
    if (matches.length === 0 || !editorView) return;
    const changes = matches.map(m => ({ from: m.from, to: m.to, insert: computeReplacement(m) }));
    const firstFrom = changes[0].from;
    // Dispatch all changes in one transaction — a single undo step.
    editorView.dispatch({
      changes,
      selection: { anchor: firstFrom, head: firstFrom },
      scrollIntoView: true,
    });
  }

  function close() {
    uiStore.setFileSearchOpen(false);
    editorView?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        prevMatch();
      } else {
        nextMatch();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

</script>

<div 
  transition:fly={{ y: -20, duration: 250, easing: cubicOut }}
  class="absolute top-3 z-50 bg-surface border border-subtle rounded shadow-elevated flex flex-col w-[480px] text-sm text-primary overflow-hidden"
  style="right: {Math.max(32, rightGap + 32)}px;"
>
  <div class="flex items-center p-1.5 gap-1.5">
    <Tooltip content="Toggle Replace">
      <button aria-label="Toggle Replace" class="p-1 hover:bg-hover rounded text-muted transition-colors focus:outline-none" onclick={() => isReplaceVisible = !isReplaceVisible}>
        <ChevronDown size={14} class="transition-transform {isReplaceVisible ? '' : '-rotate-90'}" />
      </button>
    </Tooltip>
    <div class="flex items-center bg-canvas border border-subtle rounded px-2 py-0.5 flex-1 focus-within:border-focus focus-within:ring-1 focus-within:ring-focus transition-all">
      <input bind:this={inputEl} type="text" bind:value={query} onkeydown={handleKeydown} placeholder="Find" class="bg-transparent border-none outline-none w-full text-[13px] placeholder-muted" />
    </div>
    <div class="text-[11px] text-muted whitespace-nowrap min-w-[50px] text-center shrink-0">
      {#if matches.length > 0}
        {currentMatchIndex + 1} of {matches.length}
      {:else if query.length > 0}
        {isInvalidRegex ? 'Invalid regex' : 'No results'}
      {/if}
    </div>
    <div class="flex items-center border-l border-subtle pl-1 gap-0.5 shrink-0">
      <Tooltip content="Match Case">
        <button aria-label="Match Case" class="p-1 hover:bg-hover rounded text-icon-default transition-colors focus:outline-none {caseSensitive ? 'text-accent' : ''}" onclick={() => caseSensitive = !caseSensitive}>
          <CaseSensitive size={13} />
        </button>
      </Tooltip>
      <Tooltip content="Match Whole Word">
        <button aria-label="Match Whole Word" class="p-1 hover:bg-hover rounded text-icon-default transition-colors focus:outline-none {wholeWord ? 'text-accent' : ''}" onclick={() => wholeWord = !wholeWord}>
          <WholeWord size={13} />
        </button>
      </Tooltip>
      <Tooltip content="Use Regular Expression">
        <button aria-label="Use Regular Expression" class="p-1 hover:bg-hover rounded text-icon-default transition-colors focus:outline-none {useRegex ? 'text-accent' : ''}" onclick={() => useRegex = !useRegex}>
          <Regex size={13} />
        </button>
      </Tooltip>
    </div>
    <div class="flex items-center border-l border-subtle pl-1 gap-0.5 shrink-0">
      <Tooltip content="Previous Match (Shift+Enter)">
        <button aria-label="Previous Match" class="p-1 hover:bg-hover rounded text-icon-default disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none" disabled={matches.length === 0} onclick={prevMatch}>
          <ChevronUp size={14} />
        </button>
      </Tooltip>
      <Tooltip content="Next Match (Enter)">
        <button aria-label="Next Match" class="p-1 hover:bg-hover rounded text-icon-default disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none" disabled={matches.length === 0} onclick={nextMatch}>
          <ChevronDown size={14} />
        </button>
      </Tooltip>
      <Tooltip content="Close (Esc)">
        <button aria-label="Close" class="p-1 hover:bg-error hover:text-on-accent rounded text-icon-default ml-1 transition-colors focus:outline-none" onclick={close}>
          <X size={14} />
        </button>
      </Tooltip>
    </div>
  </div>
  
  {#if isReplaceVisible}
    <div class="flex items-center p-1.5 gap-1.5 pt-0">
      <div class="w-[22px] shrink-0"></div>
      <div class="flex items-center bg-canvas border border-subtle rounded px-2 py-0.5 flex-1 focus-within:border-focus focus-within:ring-1 focus-within:ring-focus transition-all">
        <input bind:this={replaceInputEl} type="text" bind:value={replaceQuery} onkeydown={(e) => e.key === 'Enter' && replaceCurrent()} placeholder="Replace" class="bg-transparent border-none outline-none w-full text-[13px] placeholder-muted" />
      </div>
      <div class="flex items-center gap-0.5 shrink-0 pr-1">
        <Tooltip content="Replace (Enter)">
          <button aria-label="Replace" class="p-1 hover:bg-hover rounded text-icon-default disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none" disabled={matches.length === 0} onclick={replaceCurrent}>
            <Replace size={14} />
          </button>
        </Tooltip>
        <Tooltip content="Replace All">
          <button aria-label="Replace All" class="p-1 hover:bg-hover rounded text-icon-default disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none" disabled={matches.length === 0} onclick={replaceAllMatches}>
            <ReplaceAll size={14} />
          </button>
        </Tooltip>
      </div>
    </div>
  {/if}
</div>