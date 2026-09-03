import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { getHumanReadableError } from '../utils/error';
import { settingsStore } from './settings.svelte';
import {
  UNTITLED_PREFIX,
  UNKNOWN_NAME,
  BINARY_SENTINEL,
  LARGE_FILE_SENTINEL,
  SUSPEND_TAB_AFTER_MS,
  MAX_IN_MEMORY_TABS,
  MAX_CLOSED_TABS,
  AUTOSAVE_FALLBACK_DELAY_MS,
  SAVE_STATUS_CLEAR_MS,
  generateId,
} from '../constants';
import { isImageFile } from '../utils/path';
import { buildReplaceRegex, applyReplacement, type ReplaceMatchOptions } from '../utils/replace';
import { splitStore } from './split';

export interface ClosedTabEntry {
  path: string;
  cursorPos?: { line: number; column: number; endColumn?: number };
  scrollTop?: { top: number; left: number };
}

export interface EditorTab {
  id: string;
  path: string;
  name: string;
  content: string | null;
  originalContent: string | null;
  isModified: boolean;
  language: string;
  isPreview?: boolean;
  isPinned?: boolean;
  lastAccessed: number;
  isLargeFile?: boolean;
  isLoading?: boolean;
  isUnsupported?: boolean;
  autoSavePaused?: boolean;
  status?: 'active' | 'loaded' | 'suspended' | 'modified' | 'deleted' | 'conflict';
  undoHistory?: any;
  redoHistory?: any;
  cursorHistory?: any[];
  currentHistoryIndex?: number;
  isDiff?: boolean;
  diffOriginalContent?: string | null;
  /** Diff tab extras (labels + right-side editability) — mirrors VSCode's
   *  "Working Tree" (editable right side) vs commit-compare (read-only) tabs. */
  diffOriginalLabel?: string;
  diffCurrentLabel?: string;
  diffOriginalRevision?: string;
  diffCurrentRevision?: string;
  gitRevision?: string;
  diffEditable?: boolean;
  /** Plain (non-diff) tab opened read-only (e.g. a file at a fixed commit). */
  readOnly?: boolean;
  svgViewMode?: 'image' | 'code' | 'split';
  mdViewMode?: 'preview' | 'code' | 'split';
  /** Whether language detection has completed (prevents status bar flicker). */
  languageDetected?: boolean;
  /** Detected character encoding (CORE-005). */
  encoding?: string;
  /** Detected line ending style: 'LF' or 'CRLF' (CORE-005). */
  lineEnding?: string;
  /** When true, MD/SVG preview routing is suppressed — the editor always shows
   *  raw code. Used for SC history tabs (commit snapshots, diff views) where
   *  the goal is code review, not rendered preview. */
  noPreview?: boolean;
}

export type TabInput = {
  id: string;
  path: string;
  name: string;
  content: string | null;
  language: string;
  isPreview?: boolean;
  isLargeFile?: boolean;
  isLoading?: boolean;
  isUnsupported?: boolean;
  undoHistory?: any;
  isDiff?: boolean;
  diffOriginalContent?: string | null;
  diffOriginalLabel?: string;
  diffCurrentLabel?: string;
  diffOriginalRevision?: string;
  diffCurrentRevision?: string;
  gitRevision?: string;
  diffEditable?: boolean;
  readOnly?: boolean;
  svgViewMode?: 'image' | 'code' | 'split';
  /** Suppress MD/SVG preview routing — show raw code only. */
  noPreview?: boolean;
  /** Whether language detection has completed (prevents status bar flicker). */
  languageDetected?: boolean;
};

// Cursor/scroll state lives in separate Maps (not in the tabs array) so the
// tab bar and other subscribers are not re-rendered on every cursor move or
// scroll event. cursorSignal is a lightweight change notification for the
// consumers that do care.
const cursorPositions = new Map<string, { line: number; column: number; endColumn?: number }>();
const scrollPositions = new Map<string, { top: number; left: number }>();
const cursorSignal = writable<number>(0);

function createEditorStore() {
  const tabs = writable<EditorTab[]>([]);
  const activeTabId = writable<string | null>(null);
  const saveStatus = writable<string | null>(null);
  const closedTabStack: ClosedTabEntry[] = [];
  let autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const activeTab = derived([tabs, activeTabId], ([$tabs, $id]) =>
    $tabs.find((t) => t.id === $id) || null
  );

  function addTab(input: TabInput) {
    tabs.update((state) => {
      const exists = state.find((t) => t.id === input.id || (t.path === input.path && t.language === input.language));
      if (exists) {
        activeTabId.set(exists.id);
        return state.map((t) => {
          if (t.id === exists.id) {
            // Allow pinning an existing preview tab
            const isPreview = input.isPreview === false ? false : t.isPreview;
            return { ...t, lastAccessed: Date.now(), isPreview };
          }
          return t;
        });
      }

      const newTab: EditorTab = {
        ...input,
        originalContent: input.content,
        isModified: false,
        isPreview: input.isPreview ?? false,
        isUnsupported: input.isUnsupported ?? false,
        languageDetected: input.languageDetected ?? false,
        undoHistory: input.undoHistory,
        lastAccessed: Date.now(),
        status: input.content !== null ? 'active' : 'loaded',
        svgViewMode: input.svgViewMode,
      };

      let currentTabs = [...state];
      if (newTab.language !== 'welcome') {
        currentTabs = currentTabs.filter((t) => t.language !== 'welcome');
      }

      if (newTab.isPreview) {
        const previewIndex = currentTabs.findIndex((t) => t.isPreview && !t.isModified);
        if (previewIndex !== -1) {
          currentTabs[previewIndex] = newTab;
          activeTabId.set(newTab.id);
          return currentTabs;
        }
      }

      activeTabId.set(newTab.id);
      return [...currentTabs, newTab];
    });
  }

  function closeTab(id: string) {
    // Save to closed tab stack + remove tab + update activeTabId in ONE atomic
    // store update so the derived `activeTab` never sees a half-updated state
    // (tab removed but activeTabId still pointing at it).
    tabs.update((state) => {
      const tab = state.find((t) => t.id === id);
      if (tab && tab.path && !tab.path.startsWith(UNTITLED_PREFIX)) {
        closedTabStack.push({
          path: tab.path,
          cursorPos: cursorPositions.get(id),
          scrollTop: scrollPositions.get(id),
        });
        if (closedTabStack.length > MAX_CLOSED_TABS) closedTabStack.shift();
      }

      const newTabs = state.filter((t) => t.id !== id);
      activeTabId.update((current) => {
        if (current === id) {
          if (newTabs.length === 0) return null;
          // TAB-004: MRU heuristic — activate the most recently accessed tab
          const mru = newTabs.reduce((best, t) =>
            (t.lastAccessed > best.lastAccessed) ? t : best
          );
          return mru.id;
        }
        return current;
      });
      return newTabs;
    });

    // Cleanup cursor/scroll data (after the atomic update so no effect reads stale data)
    cursorPositions.delete(id);
    scrollPositions.delete(id);
  }

  /** Close a tab from every split pane AND the editor store (single source of
   *  truth — the pane tab bar renders from split store, the editor state from
   *  editor store, so both must be kept in sync when a tab is removed).
   *  Editor store is updated FIRST so the global `activeTabId` and `activeTab`
   *  are settled before the split store triggers pane re-renders — prevents a
   *  brief flash of stale language/Ln/Col in the status bar. */
  function closeTabEverywhere(id: string) {
    closeTab(id);
    splitStore.closeTabInAllPanes(id);
  }

  /** Close tabs for a deleted file/folder (exact match or nested under a
   *  deleted directory). Clean tabs are closed everywhere; dirty tabs are kept
   *  open and marked `deleted` so unsaved edits can still be recovered — same
   *  behavior as VSCode. */
  function closeTabsOfDeletedPath(path: string) {
    const affected = getTabsSnapshot().filter((t) =>
      t.path === path
      || t.path.startsWith(path + '/')
      || t.path.startsWith(path + '\\')
    );
    for (const tab of affected) {
      if (tab.isModified) {
        markTabDeleted(tab.id);
      } else {
        closeTabEverywhere(tab.id);
      }
    }
  }

  function setActiveTab(id: string) {
    activeTabId.set(id);
    tabs.update((state) =>
      state.map((t) => ({
        ...t,
        lastAccessed: t.id === id ? Date.now() : t.lastAccessed,
        status: t.id === id ? 'active' : t.status === 'active' ? 'loaded' : t.status,
      }))
    );
  }

  /** Update the global activeTabId without touching tab statuses.
   *  Used by split panes to sync the global active tab when the user clicks
   *  a tab in a different pane (without the MRU status cycling that
   *  `setActiveTab` performs). */
  function setActiveTabById(id: string) {
    activeTabId.set(id);
  }

  function setInitialContent(id: string, content: string) {
    // Update the store FIRST so that handleSyncContent (Editor.svelte)
    // reads the correct originalContent for its baseline check.  The
    // previous order dispatched the event before the store update, causing
    // handleSyncContent to read stale originalContent=null and skip the sync.
    tabs.update((state) =>
      state.map((t) => {
        if (t.id === id) {
          return {
            ...t,
            content,
            originalContent: content,
            isModified: false,
            status: 'active',
            lastAccessed: Date.now(),
          };
        }
        return t;
      })
    );

    // Notify a live CodeMirror view AFTER the store update so it can compare
    // against the updated buffer and apply the new content.
    window.dispatchEvent(new CustomEvent('editor:sync-content', { detail: { tabId: id, content } }));
  }

  function updateContent(id: string, content: string) {
    tabs.update((state) =>
      state.map((t) => {
        if (t.id === id) {
          const isModified = content !== t.originalContent;
          return {
            ...t,
            content,
            isModified,
            status: isModified ? 'modified' : 'active',
            isPreview: isModified ? false : t.isPreview,
            lastAccessed: Date.now(),
          };
        }
        return t;
      })
    );
    scheduleAutoSave(id);
  }

  function updateCursor(id: string, line: number, column: number, endColumn?: number) {
    cursorPositions.set(id, { line, column, endColumn });
    cursorSignal.update((n) => n + 1);
  }

  function updateUndoHistory(id: string, history: any) {
    tabs.update((state) =>
      state.map((t) => (t.id === id ? { ...t, undoHistory: history } : t))
    );
  }

  function updateScroll(id: string, top: number, left: number) {
    scrollPositions.set(id, { top, left });
  }

  function getCursor(id: string): { line: number; column: number; endColumn?: number } | undefined {
    return cursorPositions.get(id);
  }

  function getScroll(id: string): { top: number; left: number } | undefined {
    return scrollPositions.get(id);
  }

  function markSaved(id: string) {
    tabs.update((state) =>
      state.map((t) => {
        if (t.id === id) {
          return {
            ...t,
            originalContent: t.content,
            isModified: false,
            autoSavePaused: false,
            status: t.content !== null ? 'active' : 'loaded',
          };
        }
        return t;
      })
    );
  }

  function markTabDeleted(id: string) {
    tabs.update((state) =>
      state.map((t) => {
        if (t.id === id) {
          return { ...t, status: 'deleted' as const };
        }
        return t;
      })
    );
    splitStore.updateTabInAllPanes({ id, status: 'deleted' });
  }

  function markTabConflict(id: string) {
    tabs.update((state) =>
      state.map((t) => {
        if (t.id === id) {
          return { ...t, status: 'conflict' as const };
        }
        return t;
      })
    );
  }

  function pinTab(id: string) {
    tabs.update((state) =>
      state.map((t) => {
        if (t.id === id) {
          return { ...t, isPreview: false };
        }
        return t;
      })
    );
  }

  function togglePin(id: string) {
    tabs.update((state) =>
      state.map((t) => {
        if (t.id === id) {
          return { ...t, isPinned: !t.isPinned };
        }
        return t;
      })
    );
  }

  function setTabs(newTabs: EditorTab[], newActiveId: string | null) {
    tabs.set(newTabs);
    activeTabId.set(newActiveId);
  }

  function suspendTab(id: string) {
    tabs.update((state) =>
      state.map((t) => {
        if (t.id === id && !t.isModified && t.content !== null) {
          return { ...t, content: null, originalContent: null, status: 'suspended' as const, undoHistory: undefined };
        }
        return t;
      })
    );
    splitStore.updateTabInAllPanes({ id, content: null, originalContent: null, status: 'suspended', undoHistory: undefined });
  }

  /**
   * LRU tab suspension: if the number of tabs holding content in memory
   * exceeds MAX_IN_MEMORY_TABS, suspend the least-recently-used unmodified
   * tabs (or any tab idle for longer than SUSPEND_TAB_AFTER_MS).
   */
  function enforceMemoryLimit() {
    const suspended: Array<{ id: string; content: null; originalContent: null; status: 'suspended'; undoHistory: undefined }> = [];

    tabs.update((state) => {
      const activeId = getActiveTabIdSnapshot();
      const now = Date.now();

      // Non-active, non-modified tabs that have content in memory, oldest first
      const candidates = state
        .filter((t) => t.id !== activeId && !t.isModified && t.content !== null)
        .sort((a, b) => a.lastAccessed - b.lastAccessed);

      let inMemoryCount = state.filter((t) => t.content !== null && !t.isModified && t.id !== activeId).length;

      for (const tab of candidates) {
        const isIdleTooLong = now - tab.lastAccessed > SUSPEND_TAB_AFTER_MS;
        const isOverLimit = inMemoryCount > MAX_IN_MEMORY_TABS;

        if (isIdleTooLong || isOverLimit) {
          suspended.push({ id: tab.id, content: null, originalContent: null, status: 'suspended', undoHistory: undefined });
          state = state.map((t) =>
            t.id === tab.id
              ? { ...t, content: null, originalContent: null, status: 'suspended' as const, undoHistory: undefined }
              : t
          );
          inMemoryCount--;
        }

        if (inMemoryCount <= MAX_IN_MEMORY_TABS) break;
      }

      return state;
    });

    // Keep the split panes in sync so the pane tab bar/editor also drop the
    // evicted buffer.
    for (const s of suspended) {
      splitStore.updateTabInAllPanes(s);
    }
  }

  function scheduleAutoSave(tabId: string) {
    // Only auto-save when the setting is enabled, using the configured delay.
    if (!settingsStore.effectiveSettings.auto_save) return;
    if (autoSaveTimers.has(tabId)) clearTimeout(autoSaveTimers.get(tabId)!);
    const delay = settingsStore.effectiveSettings.auto_save_delay_ms || AUTOSAVE_FALLBACK_DELAY_MS;

    const timer = setTimeout(async () => {
      autoSaveTimers.delete(tabId);
      const snapshot = getTabsSnapshot();
      const tab = snapshot.find((t) => t.id === tabId);
      if (tab && tab.isModified && !tab.path.startsWith(UNTITLED_PREFIX) && tab.content !== null && !tab.autoSavePaused) {
        saveStatus.set('Saving...');
        // Snapshot what we are writing so edits made *while* the save was in
        // flight still leave the tab marked as modified afterwards.
        const savedContent = tab.content;
        try {
          await invoke('save_file', { path: tab.path, content: savedContent });
          tabs.update((state) =>
            state.map((t) =>
              t.id === tabId && t.content === savedContent
                ? {
                    ...t,
                    originalContent: savedContent,
                    isModified: false,
                    autoSavePaused: false,
                    status: 'active',
                  }
                : t
            )
          );
          saveStatus.set('Saved');
          setTimeout(() => clearSaveStatus(), SAVE_STATUS_CLEAR_MS);
        } catch (err) {
          console.error('Auto-save failed:', err);
          saveStatus.set(`Save failed: ${getHumanReadableError(err)}`);
          tabs.update((state) => state.map((t) => (t.id === tabId ? { ...t, autoSavePaused: true } : t)));
        }
      }
    }, delay);

    autoSaveTimers.set(tabId, timer);
  }

  function clearSaveStatus() {
    saveStatus.set(null);
  }

  function setTabLoading(id: string, loading: boolean) {
    tabs.update((state) => state.map((t) => (t.id === id ? { ...t, isLoading: loading } : t)));
    splitStore.updateTabInAllPanes({ id, isLoading: loading });
  }

  function setTabUnsupported(id: string, unsupported: boolean) {
    tabs.update((state) => state.map((t) => (t.id === id ? { ...t, isUnsupported: unsupported } : t)));
  }

  function pauseAutoSave(id: string) {
    tabs.update((state) => state.map((t) => (t.id === id ? { ...t, autoSavePaused: true } : t)));
  }

  /**
   * Apply a Replace All to an open (in-memory) tab via the store. The new
   * content is pushed through `updateContent`, which marks the tab modified
   * and schedules an auto-save — the disk write happens through the same
   * pipeline as manual edits.
   *
   * Returns the number of replaced occurrences, or 0 if none matched.
   */
  function applyReplacements(path: string, opts: ReplaceMatchOptions): number {
    const tab = getTabsSnapshot().find((t) => t.path === path && t.content !== null);
    if (!tab || tab.content === null) return 0;
    const re = buildReplaceRegex(opts.query, opts);
    const matches = tab.content.match(re);
    if (!matches || matches.length === 0) return 0;
    const newContent = tab.content.replace(re, (m) => applyReplacement(m, re, opts));
    if (newContent === tab.content) return 0;
    // Notify any LIVE CodeMirror view BEFORE the store update so a mounted pane
    // showing this tab renders the replaced text immediately (same contract as
    // setInitialContent — it bails when the view has in-flight, not-yet-extracted
    // user edits, in which case the debounced extractor wins).
    window.dispatchEvent(new CustomEvent('editor:sync-content', { detail: { tabId: tab.id, content: newContent } }));
    updateContent(tab.id, newContent);
    return matches.length;
  }

  function getTabsSnapshot(): EditorTab[] {
    let val: EditorTab[] = [];
    tabs.subscribe((v) => (val = v))();
    return val;
  }

  function getActiveTabIdSnapshot(): string | null {
    let val: string | null = null;
    activeTabId.subscribe((v) => (val = v))();
    return val;
  }

  /**
   * Snapshot of cursor/scroll positions for all tabs (for workspace session
   * save). Returns an array of { id, cursor, scroll } objects.
   */
  function getCursorScrollSnapshot() {
    const result: Array<{ id: string; cursor?: { line: number; column: number; endColumn?: number }; scroll?: { top: number; left: number } }> = [];
    for (const [id, cursor] of cursorPositions) {
      result.push({ id, cursor, scroll: scrollPositions.get(id) });
    }
    // Include tabs with scroll but no cursor
    for (const [id, scroll] of scrollPositions) {
      if (!cursorPositions.has(id)) {
        result.push({ id, scroll });
      }
    }
    return result;
  }

  function updateTabPath(oldPath: string, newPath: string) {
    let renamed: Array<{ id: string; nextId: string; path: string }> = [];
    tabs.update((state) => {
      renamed = [];
      const next = state.map((t) => {
        const isUnderOld = t.path === oldPath
          || t.path.startsWith(oldPath + '/')
          || t.path.startsWith(oldPath + '\\');
        if (!isUnderOld) return t;
        const newTabPath = t.path === oldPath ? newPath : newPath + t.path.slice(oldPath.length);
        // Tabs created with `id === path` (e.g. palette/session restores) must
        // migrate their id with the rename; generated ids stay stable.
        const nextId = t.id === t.path ? newTabPath : t.id;
        renamed.push({ id: t.id, nextId, path: newTabPath });
        return { ...t, id: nextId, path: newTabPath, name: newTabPath.split(/[/\\]/).pop() || t.name };
      });
      return next;
    });

    // Migrate id-keyed cursor/scroll state and the active-tab pointer.
    for (const r of renamed) {
      if (r.id === r.nextId) continue;
      const cur = cursorPositions.get(r.id);
      if (cur) {
        cursorPositions.set(r.nextId, cur);
        cursorPositions.delete(r.id);
      }
      const scr = scrollPositions.get(r.id);
      if (scr) {
        scrollPositions.set(r.nextId, scr);
        scrollPositions.delete(r.id);
      }
      activeTabId.update((current) => (current === r.id ? r.nextId : current));
    }

    splitStore.updateTabPathInAllPanes(oldPath, newPath);
  }

  async function reopenClosedTab() {
    const entry = closedTabStack.pop();
    if (!entry) return;

    const fileName = entry.path.split(/[/\\]/).pop() || UNKNOWN_NAME;
    let content = '';
    let isLargeFile = false;
    if (!isImageFile(fileName)) {
      try {
        content = await invoke<string>('read_file_text', { path: entry.path });
      } catch (e) {
        if (String(e) === BINARY_SENTINEL) content = '';
        else if (String(e) === LARGE_FILE_SENTINEL) {
          try {
            const chunked = await invoke<any>('read_file_chunked', { path: entry.path });
            content = chunked.content;
            isLargeFile = true;
          } catch (err) {
            return;
          }
        } else return; // If file doesn't exist anymore, abort
      }
    }

    let language = 'plaintext';
    if (isImageFile(fileName)) language = 'image';
    else {
      try {
        language = await invoke<string>('detect_language', { path: entry.path });
      } catch {}
    }

    const id = generateId('tab');
    addTab({
      id,
      path: entry.path,
      name: fileName,
      content,
      language,
      languageDetected: true,
      isPreview: isLargeFile,
      isLargeFile,
    });
    setActiveTab(id);

    if (entry.cursorPos) updateCursor(id, entry.cursorPos.line, entry.cursorPos.column, entry.cursorPos.endColumn);
    if (entry.scrollTop) updateScroll(id, entry.scrollTop.top, entry.scrollTop.left);
  }

  function updateTab(id: string, props: Partial<EditorTab>) {
    tabs.update((tbs) =>
      tbs.map((t) => (t.id === id ? { ...t, ...props } : t))
    );
  }

  return {
    tabs: { subscribe: tabs.subscribe },
    activeTabId: { subscribe: activeTabId.subscribe },
    activeTab,
    saveStatus: { subscribe: saveStatus.subscribe },
    cursorSignal: { subscribe: cursorSignal.subscribe },
    addTab,
    closeTab,
    closeTabEverywhere,
    closeTabsOfDeletedPath,
    setActiveTab,
    setActiveTabById,
    setInitialContent,
    updateContent,
    updateCursor,
    updateScroll,
    updateUndoHistory,
    updateTab,
    getCursor,
    getScroll,
    markSaved,
    markTabDeleted,
    markTabConflict,
    setTabLoading,
    setTabUnsupported,
    clearSaveStatus,
    pinTab,
    togglePin,
    setTabs,
    suspendTab,
    enforceMemoryLimit,
    getTabsSnapshot,
    getActiveTabIdSnapshot,
    getCursorScrollSnapshot,
    updateTabPath,
    reopenClosedTab,
    pauseAutoSave,
    applyReplacements,
  };
}

export const editorStore = createEditorStore();
