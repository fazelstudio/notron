/**
 * Navigation
 *
 * State store for navigation.
 */

import { writable, get, derived } from 'svelte/store';
import { MAX_NAV_STACK, NAV_LINE_DELTA } from '../constants';

export interface NavEntry {
  id: string;
  filePath: string;
  line: number;
  column: number;
  editorGroupId: string;
  timestamp: number;
  isEditPoint: boolean;
}

export type NavigationScope = 'default' | 'editorGroup' | 'editor';

interface NavigationState {
  entries: NavEntry[];
  currentIndex: number;
  scope: NavigationScope;
}

let _entryIdCounter = 0;
function generateEntryId(): string {
  return `nav-${Date.now()}-${++_entryIdCounter}`;
}

const _state = writable<NavigationState>({
  entries: [],
  currentIndex: -1,
  scope: 'default',
});

// When true, tab-switch effects must NOT record navigation entries (the
// programmatic navigation triggered by navigateBack/navigateForward is
// already recording the target entry itself).
let _navigating = false;

export const canGoBack = derived(_state, ($s) => $s.currentIndex > 0);
export const canGoForward = derived(_state, ($s) => $s.currentIndex < $s.entries.length - 1);

function createNavigationStore() {
  return {
    subscribe: _state.subscribe,

    recordNavigation(
      filePath: string,
      line: number,
      column: number,
      editorGroupId: string = 'default',
      isEditPoint: boolean = false
    ) {
      // Skip recording while the store is driving a programmatic
      // back/forward navigation — navigateBack/navigateForward already
      // updates the index and records the target entry itself.
      if (_navigating) return;

      _state.update((state) => {
        const location: NavEntry = {
          id: generateEntryId(),
          filePath,
          line,
          column,
          editorGroupId,
          timestamp: Date.now(),
          isEditPoint,
        };

        // NAV-008: Deduplication — same file and within NAV_LINE_DELTA
        // means just update the last recorded entry for that file rather
        // than pushing a new one.  We search backwards from the end of the
        // array (not currentIndex which can be stale after truncation).
        const entries = state.entries;
        if (entries.length > 0) {
          const last = entries[entries.length - 1];
          if (last.filePath === filePath && Math.abs(last.line - line) <= NAV_LINE_DELTA) {
            const updatedEntries = [...entries];
            updatedEntries[entries.length - 1] = {
              ...last,
              line,
              column,
              timestamp: Date.now(),
              isEditPoint: last.isEditPoint || isEditPoint,
            };
            return { ...state, entries: updatedEntries };
          }
        }

        // NAV-003: Truncate forward stack — everything after currentIndex
        // is discarded when a new marker is dropped (browser-like).
        const truncatedEntries = entries.slice(0, state.currentIndex + 1);
        const newEntries = [...truncatedEntries, location];

        // NAV-004: Enforce stack limit (FIFO — drop oldest)
        if (newEntries.length > MAX_NAV_STACK) {
          newEntries.shift();
        }

        return {
          ...state,
          entries: newEntries,
          currentIndex: newEntries.length - 1,
        };
      });
    },

    async navigateBack(): Promise<void> {
      const state = get(_state);
      if (state.currentIndex <= 0) return;

      const targetIndex = state.currentIndex - 1;
      const target = state.entries[targetIndex];

      _navigating = true;
      try {
        _state.update((s) => ({ ...s, currentIndex: targetIndex }));
        await this.navigateToEntry(target);
      } finally {
        _navigating = false;
      }
    },

    async navigateForward(): Promise<void> {
      const state = get(_state);
      if (state.currentIndex >= state.entries.length - 1) return;

      const targetIndex = state.currentIndex + 1;
      const target = state.entries[targetIndex];

      _navigating = true;
      try {
        _state.update((s) => ({ ...s, currentIndex: targetIndex }));
        await this.navigateToEntry(target);
      } finally {
        _navigating = false;
      }
    },

 // NAV-006: Navigate to entry (reopen file if closed)
    // Dispatches `request-open-file` so App.svelte handles content loading
    // and goto-retry through the normal open-file flow.  The raw addTab +
    // single-shot editor:action approach failed because the Editor component
    // is not mounted while content is null (SplitEditorPane line 599/613).
    navigateToEntry(entry: NavEntry): void {
      // NAV-005: Focus the correct editor group before opening the file
      if (entry.editorGroupId !== 'default') {
        window.dispatchEvent(
          new CustomEvent('editor:focus-group', { detail: { groupId: entry.editorGroupId } })
        );
      }

      // Delegate to App.svelte's open-file handler which loads content
      // and retries the goto until the Editor mounts.
      window.dispatchEvent(
        new CustomEvent('request-open-file', {
          detail: {
            path: entry.filePath,
            line: entry.line,
            column: entry.column,
            endColumn: entry.column,
          },
        })
      );
    },

    reset(): void {
      _navigating = false;
      _state.set({ entries: [], currentIndex: -1, scope: 'default' });
    },

    setScope(scope: NavigationScope): void {
      _state.update((s) => ({ ...s, scope }));
    },

    /** True while navigateBack / navigateForward is executing. */
    isNavigating(): boolean {
      return _navigating;
    },

    getState(): NavigationState {
      return get(_state);
    },

    setState(state: NavigationState): void {
      _state.set(state);
    },
  };
}

export const navigationStore = createNavigationStore();
