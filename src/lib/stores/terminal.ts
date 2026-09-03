import { writable } from 'svelte/store';
import {
  DEFAULT_TERMINAL_HEIGHT,
  MIN_TERMINAL_HEIGHT,
  TERMINAL_BOTTOM_MARGIN,
  MAX_OUTPUT_LOGS,
  TERMINAL_TYPES,
  SHELL_DISPLAY_NAMES,
  type TerminalType,
  type BottomPanelName,
  generateId,
} from '../constants';
import { settingsStore } from './settings.svelte';
import { getPlatformShells } from '../utils/platform';

export type { TerminalType };
export { TERMINAL_TYPES };

export interface TerminalInstance {
  id: string;
  name: string;
  type: TerminalType;
  cwd: string;
  initialCommand?: string;
  /** Extra environment variables merged over the inherited process env. */
  env?: Record<string, string>;
}

interface TerminalState {
  terminals: TerminalInstance[];
  activeTerminalId: string | null;
  isVisible: boolean;
  isMaximized: boolean;
  height: number;
  isResizing: boolean;
  activePanel: BottomPanelName;
  outputLogs: string[];
}

const HEIGHT_KEY = 'terminal_height';
const VISIBLE_KEY = 'terminal_isVisible';
const MAXIMIZED_KEY = 'terminal_isMaximized';

function readStorageNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const value = parseInt(localStorage.getItem(key) || '', 10);
  return Number.isNaN(value) ? fallback : value;
}

function readStorageFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(key) === 'true';
}

function clampHeight(height: number): number {
  if (Number.isNaN(height)) return DEFAULT_TERMINAL_HEIGHT;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 600;
  const max = Math.max(MIN_TERMINAL_HEIGHT, viewportHeight - TERMINAL_BOTTOM_MARGIN);
  return Math.max(MIN_TERMINAL_HEIGHT, Math.min(max, height));
}

/** VSCode-style timestamp: YYYY-MM-DD HH:mm:ss.SSS */
function formatLogTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function createTerminalStore() {
  const state = writable<TerminalState>({
    terminals: [],
    activeTerminalId: null,
    isVisible: readStorageFlag(VISIBLE_KEY),
    isMaximized: readStorageFlag(MAXIMIZED_KEY),
    height: readStorageNumber(HEIGHT_KEY, DEFAULT_TERMINAL_HEIGHT),
    isResizing: false,
    activePanel: 'terminal',
    outputLogs: [],
  });

  function update(fn: (s: TerminalState) => Partial<TerminalState>) {
    state.update((s) => ({ ...s, ...fn(s) }));
  }

  // Live PTY handles by tab id, registered by TerminalInstance on spawn.
  // Non-reactive by design: only used to kill processes (Stop / rerun).
  const processKills = new Map<string, () => void>();

  return {
    subscribe: state.subscribe,
    newTerminal: (type: TerminalType = settingsStore.effectiveSettings.default_shell, cwd: string = '', options?: { initialCommand?: string; name?: string; exactName?: boolean; env?: Record<string, string> }): string => {
      let createdId = '';
      state.update((s) => {
        // Guard against stale/invalid values: a shell saved on another OS
        // (e.g. 'cmd' from a Windows session) falls back to this platform's.
        const platformShells = getPlatformShells();
        const safeType = platformShells.includes(type) ? type : platformShells[0];
        const id = generateId('term');
        createdId = id;
        const baseName = options?.name || SHELL_DISPLAY_NAMES[safeType];
        // exactName skips the counter suffix — used by the Run feature so a
        // configuration's terminal always carries a predictable name.
        const name = options?.exactName ? baseName : `${baseName} ${s.terminals.length + 1}`;
        const newTerm = { id, name, type: safeType, cwd, initialCommand: options?.initialCommand, env: options?.env };
        localStorage.setItem(VISIBLE_KEY, 'true');
        return {
          ...s,
          terminals: [...s.terminals, newTerm],
          activeTerminalId: id,
          isVisible: true,
        };
      });
      return createdId;
    },
    closeTerminal: (id: string) => {
      state.update((s) => {
        const filtered = s.terminals.filter((t) => t.id !== id);
        let activeId = s.activeTerminalId;
        if (activeId === id) {
          activeId = filtered.length > 0 ? filtered[0].id : null;
        }
        const v = filtered.length > 0 ? s.isVisible : false;
        if (s.isVisible !== v) localStorage.setItem(VISIBLE_KEY, String(v));
        return {
          ...s,
          terminals: filtered,
          activeTerminalId: activeId,
          isVisible: v,
        };
      });
    },
    consumeInitialCommand: (id: string) => {
      state.update((s) => ({
        ...s,
        terminals: s.terminals.map((t) => (t.id === id ? { ...t, initialCommand: undefined } : t)),
      }));
    },
    registerProcess: (id: string, kill: () => void) => {
      processKills.set(id, kill);
    },
    unregisterProcess: (id: string) => {
      processKills.delete(id);
    },
    /** Forcefully kill the PTY behind a terminal tab. Returns true when a live process was killed. */
    killProcess: (id: string): boolean => {
      const kill = processKills.get(id);
      if (!kill) return false;
      try { kill(); } catch {}
      processKills.delete(id);
      return true;
    },
    setTerminals: (terminals: TerminalInstance[], activeTerminalId: string | null) => update(() => ({ terminals, activeTerminalId })),
    setActive: (id: string) => update(() => ({ activeTerminalId: id })),
    setActivePanel: (panel: BottomPanelName) => {
      state.update((s) => {
        localStorage.setItem(VISIBLE_KEY, 'true');
        return { ...s, activePanel: panel, isVisible: true };
      });
    },
    addOutputLog: (log: string, level: string = 'info') =>
      update((s) => {
        const entry = `${formatLogTimestamp(new Date())} [${level}] ${log}`;
        const outputLogs = [...s.outputLogs, entry];
        if (outputLogs.length > MAX_OUTPUT_LOGS) {
          outputLogs.splice(0, outputLogs.length - MAX_OUTPUT_LOGS);
        }
        return { outputLogs };
      }),
    clearOutput: () => update(() => ({ outputLogs: [] })),
    setResizing: (val: boolean) => update(() => ({ isResizing: val })),
    toggleVisibility: () =>
      state.update((s) => {
        const v = !s.isVisible;
        localStorage.setItem(VISIBLE_KEY, String(v));
        return { ...s, isVisible: v };
      }),
    setVisibility: (visible: boolean) =>
      update(() => {
        localStorage.setItem(VISIBLE_KEY, String(visible));
        return { isVisible: visible };
      }),
    toggleMaximize: () =>
      state.update((s) => {
        const v = !s.isMaximized;
        localStorage.setItem(MAXIMIZED_KEY, String(v));
        return { ...s, isMaximized: v };
      }),
    setMaximize: (val: boolean) =>
      update(() => {
        localStorage.setItem(MAXIMIZED_KEY, String(val));
        return { isMaximized: val };
      }),
    setHeight: (h: number) =>
      update(() => {
        const height = clampHeight(h);
        localStorage.setItem(HEIGHT_KEY, String(height));
        return { height };
      }),
    getSnapshot: (): TerminalState => {
      let val: TerminalState = null!;
      state.subscribe((v) => (val = v))();
      return val;
    },
    initFromState: (savedState: TerminalState) => {
      state.set({ ...savedState, height: clampHeight(savedState.height) });
    },
    initFromStorage: () => {
      update(() => ({
        isVisible: readStorageFlag(VISIBLE_KEY),
        isMaximized: readStorageFlag(MAXIMIZED_KEY),
        height: readStorageNumber(HEIGHT_KEY, DEFAULT_TERMINAL_HEIGHT),
      }));
    },
  };
}

export const terminalStore = createTerminalStore();
