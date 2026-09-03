/**
 * Shared application constants.
 *
 * Single source of truth for every tunable value — timings, limits,
 * identifiers, sentinels and platform facts. Components, stores and services
 * import from here instead of re-declaring magic numbers.
 */

// ── Identity & sentinels ──────────────────────────────────────────────────
export const UNTITLED_PREFIX = 'Untitled';
export const UNKNOWN_NAME = 'Unknown';
export const BINARY_SENTINEL = '__BINARY__';
export const LARGE_FILE_SENTINEL = '__LARGE_FILE__';
/** Files at or above this size are streamed in chunks instead of being read at once. */
export const LARGE_FILE_THRESHOLD_BYTES = 1_048_576;
export const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i;

// ── Theme ─────────────────────────────────────────────────────────────────
export const THEME_KEY = 'notron_theme';
export const SYSTEM_THEME = 'system';
export const DEFAULT_THEME = 'vscode-dark';

// ── Settings ──────────────────────────────────────────────────────────────
/** Auto-save debounce used when the setting has no explicit delay. */
export const AUTOSAVE_FALLBACK_DELAY_MS = 1500;
export const SAVE_STATUS_CLEAR_MS = 2000;
export const SETTINGS_SAVE_DEBOUNCE_MS = 500;

// ── Editor ────────────────────────────────────────────────────────────────
/** Tabs idle for this long get their content suspended to free memory. */
export const SUSPEND_TAB_AFTER_MS = 300_000;
export const MAX_IN_MEMORY_TABS = 8;
export const MAX_CLOSED_TABS = 10;
export const MEMORY_LIMIT_CHECK_MS = 30_000;

// ── Session persistence ───────────────────────────────────────────────────
export const SESSION_SAVE_DEBOUNCE_MS = 2000;
export const CURSOR_SAVE_DEBOUNCE_MS = 3000;
export const EXPANDED_SAVE_DEBOUNCE_MS = 1000;

// ── Navigation ────────────────────────────────────────────────────────────
export const MAX_NAV_STACK = 50;
/** History entries on the same file closer than this line distance are collapsed. */
export const NAV_LINE_DELTA = 10;
export const GOTO_DISPATCH_MS = 50;

// ── Git ───────────────────────────────────────────────────────────────────
export const GIT_LOG_LIMIT = 50;
export const REFRESH_REPO_DEBOUNCE_MS = 300;
export const GIT_STATUS_DEBOUNCE_MS = 400;
/** Widths (%) of skeleton shimmer rows in loading states (mirrors real list rows). */
export const SKELETON_ROW_WIDTHS = [75, 55, 88, 45, 68];
/** Default number of skeleton rows per mirrored section when no state is known yet. */
export const SKELETON_DEFAULT_GROUP_ROWS = 4;
export const SKELETON_DEFAULT_COMMIT_ROWS = 6;
/** Default changes/graph split ratio (0..1) in the Source Control panel when no per-workspace size is saved. */
export const SC_SPLIT_DEFAULT = 0.5;

// ── Terminal ──────────────────────────────────────────────────────────────
export const DEFAULT_TERMINAL_HEIGHT = 250;
export const MIN_TERMINAL_HEIGHT = 100;
/** Terminal max height = window height minus this margin. */
export const TERMINAL_BOTTOM_MARGIN = 100;
export const HOVER_TERMINAL_MIN_HEIGHT = 50;
export const HOVER_TERMINAL_BOTTOM_MARGIN = 150;
export const TERMINAL_SCROLL_EPSILON = 10;
export const MAX_OUTPUT_LOGS = 500;

/**
 * All shells Notron can spawn across platforms. Which ones are offered at
 * runtime is OS-dependent — see PLATFORM_SHELLS / utils/platform.ts.
 */
export const TERMINAL_TYPES = ['powershell', 'cmd', 'zsh', 'bash'] as const;
export type TerminalType = (typeof TERMINAL_TYPES)[number];
export const SHELL_DISPLAY_NAMES: Record<TerminalType, string> = {
  powershell: 'PowerShell',
  cmd: 'Command Prompt',
  zsh: 'Zsh',
  bash: 'Bash',
};
export const SHELL_BINARIES: Record<TerminalType, string> = {
  powershell: 'powershell.exe',
  cmd: 'cmd.exe',
  zsh: 'zsh',
  bash: 'bash',
};
/** Shells available per platform, ordered by preference. */
export const PLATFORM_SHELLS: Record<'windows' | 'macos' | 'linux', TerminalType[]> = {
  windows: ['powershell', 'cmd'],
  macos: ['zsh', 'bash'],
  linux: ['bash', 'zsh'],
};

// ── Run ───────────────────────────────────────────────────────────────────
/** Prefix for terminals spawned by the Run feature (a counter may follow). */
export const RUN_TERMINAL_PREFIX = 'Run';
/** Workspace-relative location of the launch configuration file. */
export const LAUNCH_JSON_DIR = '.vscode';
export const LAUNCH_JSON_FILE = 'launch.json';

export const OUTPUT_CATEGORIES = ['Git', 'Window', 'Extension Host', 'ESLint'] as const;
export type OutputCategory = (typeof OUTPUT_CATEGORIES)[number];
export const BOTTOM_PANELS = ['problems', 'output', 'terminal'] as const;
export type BottomPanelName = (typeof BOTTOM_PANELS)[number];

// ── Layout ────────────────────────────────────────────────────────────────
export const DEFAULT_SIDEBAR_WIDTH = 240;
export const MIN_SIDEBAR_WIDTH = 160;
export const MAX_SIDEBAR_WIDTH = 600;
/** Width of the minimap panel when enabled (must match .cm-minimap-container width in app.css). */
export const MINIMAP_WIDTH = 150;
/** Width of the native WebKit scrollbar track used by .cm-scroller. */
export const EDITOR_SCROLLBAR_WIDTH = 14;

// ── Status bar / toasts ───────────────────────────────────────────────────
export const DEFAULT_STATUS_MS = 3000;
export const STATUS_UPDATE_DELAY_MS = 500;
export const TOAST_DISMISS_MS = 5000;
export const MAX_TOASTS = 5;

// ── Palette / command search ──────────────────────────────────────────────
export const FZF_LIMIT = 15;
export const MAX_PALETTE_INDEX_FILES = 50_000;
export const PALETTE_CACHE_TTL_MS = 60_000;
export const RUN_STATUS_MS = 2200;

// ── File explorer ─────────────────────────────────────────────────────────
export const DEFAULT_EXCLUDE_DIRS = ['node_modules', '.git', 'target', 'dist'];

// ── Search ────────────────────────────────────────────────────────────────
/** Debounce for global search while typing in the Search panel. */
export const SEARCH_DEBOUNCE_MS = 300;

/** How long the opened search result stays highlighted in the editor viewport. */
export const SEARCH_RESULT_HIGHLIGHT_MS = 8000;

/** Generates a reasonably collision-safe id for ephemeral entities (tabs, terminals). */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
