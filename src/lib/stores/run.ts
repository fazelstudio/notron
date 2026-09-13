/**
 * Run
 *
 * State store for run.
 */

import { writable } from 'svelte/store';

export interface RunConfiguration {
  name: string;
  type: string;
  request: 'launch' | 'attach';
  program?: string;
  cwd?: string;
  args?: string[];
  runtimeExecutable?: string;
  runtimeArgs?: string[];
  url?: string;
  port?: number;
  env?: Record<string, string>;
  envFile?: string;
  pythonPath?: string;
  rubyPath?: string;
  source: 'launch.json' | 'detected';
  /**
   * How this config was resolved (manifest/framework/heuristic/active),
   * shown as a hint in the Run dropdown and used for the "Save as launch
   * configuration" action.
   */
  detectedTier?: 'manifest' | 'framework' | 'heuristic' | 'active';
  /**
   * Dev-server command for framework entries (e.g. "next dev"). Used by
   * the terminal Run path when there is no single program file.
   */
  command?: string;
  /**
   * Set on "Current File" configurations: run this exact path through the
   * standalone run-target registry instead of a type-specific launcher.
   */
  currentFile?: string;
}

interface RunStoreState {
  configurations: RunConfiguration[];
  selectedConfigurationName: string | null;
  lastRunLabel: string | null;
}

const initialState: RunStoreState = {
  configurations: [],
  selectedConfigurationName: null,
  lastRunLabel: null,
};

function createRunStore() {
  const { subscribe, set, update } = writable<RunStoreState>(initialState);

  return {
    subscribe,
    set,
    update,

    setConfigurations: (configurations: RunConfiguration[]) => {
      update((s) => {
        const selectedConfigurationName =
          s.selectedConfigurationName && configurations.some((c) => c.name === s.selectedConfigurationName)
            ? s.selectedConfigurationName
            : (configurations[0]?.name ?? null);

        return {
          ...s,
          configurations,
          selectedConfigurationName,
        };
      });
    },

    selectConfiguration: (name: string | null) => {
      update((s) => ({ ...s, selectedConfigurationName: name }));
    },

    setLastRunLabel: (lastRunLabel: string | null) => {
      update((s) => ({ ...s, lastRunLabel }));
    },
  };
}

export const runStore = createRunStore();
