/**
 * Source Control
 *
 * State store for source control.
 */

import { writable } from 'svelte/store';
import { SC_SPLIT_DEFAULT } from '../constants';

/**
 * Source Control panel UI state — persisted per workspace (via the session
 * blob in App.svelte) so the skeleton and the split view use the ACTUAL
 * saved sizes on restore, falling back to defaults when nothing is saved.
 */

export type ScViewMode = 'list' | 'tree';

export interface ScUiState {
  /** Changes section share of the vertical split (0..1, graph = 1 - this). */
  changesFlex: number;
  changesVisible: boolean;
  graphVisible: boolean;
  changesView: ScViewMode;
  graphView: ScViewMode;
  /** Folders the user collapsed in the changes tree (default: all expanded). */
  collapsedFolders: string[];
  /** Folders the user collapsed in the graph tree — kept separate from the
   *  changes tree so the two views have independent collapse state. */
  graphCollapsedFolders: string[];
  /** Branch/ref groups the user collapsed in the graph tree (default: all expanded). */
  collapsedGroups: string[];
}

function createScStore() {
  const state = writable<ScUiState>({
    changesFlex: SC_SPLIT_DEFAULT,
    changesVisible: true,
    graphVisible: true,
    changesView: 'list',
    graphView: 'list',
    collapsedFolders: [],
    graphCollapsedFolders: [],
    collapsedGroups: [],
  });

  function patch(p: Partial<ScUiState>) {
    state.update((s) => ({ ...s, ...p }));
  }

  return {
    subscribe: state.subscribe,

    setSplit: (changesFlex: number) => {
      const clamped = Math.min(0.9, Math.max(0.1, changesFlex));
      patch({ changesFlex: clamped });
    },
    toggleChangesVisible: () => state.update((s) => ({ ...s, changesVisible: !s.changesVisible })),
    toggleGraphVisible: () => state.update((s) => ({ ...s, graphVisible: !s.graphVisible })),
    setChangesView: (mode: ScViewMode) => patch({ changesView: mode }),
    setGraphView: (mode: ScViewMode) => patch({ graphView: mode }),
    toggleCollapsedFolder: (view: 'changes' | 'graph', path: string) =>
      state.update((s) => {
        const list = view === 'graph' ? s.graphCollapsedFolders : s.collapsedFolders;
        const next = list.includes(path)
          ? list.filter((p) => p !== path)
          : [...list, path];
        return view === 'graph'
          ? { ...s, graphCollapsedFolders: next }
          : { ...s, collapsedFolders: next };
      }),
    toggleCollapsedGroup: (name: string) =>
      state.update((s) => ({
        ...s,
        collapsedGroups: s.collapsedGroups.includes(name)
          ? s.collapsedGroups.filter((g) => g !== name)
          : [...s.collapsedGroups, name],
      })),

    /** Restore persisted per-workspace state (missing keys keep current values). */
    hydrate: (json: Partial<ScUiState> | null | undefined) => {
      if (!json) return;
      patch({
        changesFlex: typeof json.changesFlex === 'number' ? json.changesFlex : SC_SPLIT_DEFAULT,
        changesVisible: json.changesVisible ?? true,
        graphVisible: json.graphVisible ?? true,
        changesView: json.changesView === 'tree' ? 'tree' : 'list',
        graphView: json.graphView === 'tree' ? 'tree' : 'list',
        collapsedFolders: Array.isArray(json.collapsedFolders) ? json.collapsedFolders : [],
        graphCollapsedFolders: Array.isArray(json.graphCollapsedFolders) ? json.graphCollapsedFolders : [],
        collapsedGroups: Array.isArray(json.collapsedGroups) ? json.collapsedGroups : [],
      });
    },

    toJSON: (): ScUiState => {
      let val: ScUiState = null!;
      state.subscribe((v) => (val = v))();
      return {
        changesFlex: val.changesFlex,
        changesVisible: val.changesVisible,
        graphVisible: val.graphVisible,
        changesView: val.changesView,
        graphView: val.graphView,
        collapsedFolders: val.collapsedFolders,
        graphCollapsedFolders: val.graphCollapsedFolders,
        collapsedGroups: val.collapsedGroups,
      };
    },
  };
}

export const sourceControlStore = createScStore();
