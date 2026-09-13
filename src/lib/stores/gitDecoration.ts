/**
 * Git Decoration
 *
 * State store for git decoration.
 */

import { writable } from 'svelte/store';
import { listen } from '@tauri-apps/api/event';

export interface GitDecoration {
  code: string; // U, M, D, A, R, C, !, Conflict
  staged: boolean;
  index_code: string | null;
  worktree_code: string | null;
  renamed_from: string | null;
  /** True when this entry is an aggregated folder badge, not a file. */
  is_rollup: boolean;
}

export interface DecorationDelta {
  changed: [string, GitDecoration][];
  removed: string[];
}

function createDecorationStore() {
  const { subscribe, update } = writable<Record<string, GitDecoration>>({});

  return {
    subscribe,
    updateDelta: (delta: DecorationDelta) => {
      update((state) => {
        const next = { ...state };
        for (const path of delta.removed) {
          delete next[path];
        }
        for (const [path, decoration] of delta.changed) {
          next[path] = decoration;
        }
        return next;
      });
    },
    /** Optimistically drop decorations for paths that no longer exist. */
    removePaths: (paths: string[]) => {
      if (paths.length === 0) return;
      update((state) => {
        const next = { ...state };
        for (const p of paths) delete next[p];
        return next;
      });
    },
    clear: () => update(() => ({})),
  };
}

export const gitDecorationStore = createDecorationStore();

// Keep the tree decorations in sync with the Rust watcher.
if (typeof window !== 'undefined') {
  listen<DecorationDelta>('git-decorations-changed', (event) => {
    gitDecorationStore.updateDelta(event.payload);
  });
}
