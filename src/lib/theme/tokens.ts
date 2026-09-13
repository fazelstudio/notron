/**
 * Tokens
 *
 * Central token definitions used by the theme bridge and all UI regions.
 */
export const NT_PRIMITIVE_TOKENS = [
  '--nt-prim-bg-base',        // settings.background (editor content bg)
  '--nt-prim-bg-elevated',    // gutterBackground solidified or bg-base
  '--nt-prim-fg-base',        // settings.foreground
  '--nt-prim-fg-muted',       // fg-base @ 60% opacity (secondary text)
  '--nt-prim-fg-subtle',      // fg-base @ 45% (ignored/disabled)
  '--nt-prim-accent',         // caret || selection
  '--nt-prim-border',         // fg-base @ 15% (subtle border)
  '--nt-prim-border-strong',  // fg-base @ 30% (strong border)
  '--nt-prim-selection',      // settings.selection
  '--nt-prim-selection-match',// settings.selectionMatch (if any)
  '--nt-prim-cursor',         // settings.caret
  '--nt-prim-line-highlight', // settings.lineHighlight (blended)
] as const;

export type NtPrimitiveToken = (typeof NT_PRIMITIVE_TOKENS)[number];

/**
 * Title bar region — window chrome, drag region, window controls.
 */
export const NT_TITLEBAR_TOKENS = [
  '--nt-titlebar-bg',     // title bar background (tinted from elevated)
  '--nt-titlebar-fg',     // title bar text/icon
  '--nt-titlebar-border', // bottom border (subtle)
] as const;

/**
 * Activity bar region.
 */
export const NT_ACTIVITYBAR_TOKENS = [
  '--nt-activitybar-bg',         // column background
  '--nt-activitybar-fg',         // inactive icon
  '--nt-activitybar-fg-active',  // active icon
  '--nt-activitybar-indicator',  // selected indicator (accent)
  '--nt-activitybar-border',     // right separator
] as const;

/**
 * Sidebar region.
 */
export const NT_SIDEBAR_TOKENS = [
  '--nt-sidebar-bg',        // main sidebar + panel surface
  '--nt-sidebar-fg',        // primary text in sidebar
  '--nt-sidebar-header-bg', // header area (alias to sidebar-bg unless theme overrides)
  '--nt-sidebar-border',    // right separator (and between header/content)
] as const;

/**
 * Editor surface.
 */
export const NT_EDITOR_TOKENS = [
  '--nt-editor-bg',             // shared by .cm-content, .cm-gutters, minimap track
  '--nt-editor-fg',             // code text
  '--nt-editor-gutter-fg',      // line numbers
  '--nt-editor-line-highlight', // active line bg (subtle)
  '--nt-editor-selection',      // selection bg
  '--nt-editor-cursor',         // caret
  '--nt-editor-border',         // separator to sidebar / tabbar
] as const;

/**
 * Tab bar region.
 */
export const NT_TABBAR_TOKENS = [
  '--nt-tabbar-bg',        // bar background
  '--nt-tab-active-bg',    // active tab (alias to editor-bg)
  '--nt-tab-inactive-bg',  // inactive tab
  '--nt-tab-border',       // dividers between tabs
  '--nt-tab-active-border',// top accent on active tab
] as const;

/**
 * Status bar region.
 */
export const NT_STATUSBAR_TOKENS = [
  '--nt-statusbar-bg',
  '--nt-statusbar-fg',
  '--nt-statusbar-border',
] as const;

/**
 * Bottom panel region.
 */
export const NT_PANEL_TOKENS = [
  '--nt-panel-bg',
  '--nt-panel-fg',
  '--nt-panel-border',
] as const;

/**
 * Overlay region.
 */
export const NT_OVERLAY_TOKENS = [
  '--nt-overlay-bg',     // dropdown/modal surface
  '--nt-overlay-fg',
  '--nt-overlay-border',
  '--nt-overlay-shadow',
] as const;

/**
 * Shared semantic tokens.
 */
export const NT_SHARED_TOKENS = [
  '--nt-hover-bg',
  '--nt-active-bg',
  '--nt-selected-bg',
  '--nt-scrollbar-thumb',
  '--nt-scrollbar-thumb-hover',
  '--nt-focus-border',
  '--nt-status-error',
  '--nt-status-warning',
  '--nt-status-info',
  '--nt-status-success',
  '--nt-untracked',
  '--nt-ignored-fg',
] as const;

export const NT_SEMANTIC_TOKENS = [
  ...NT_TITLEBAR_TOKENS,
  ...NT_ACTIVITYBAR_TOKENS,
  ...NT_SIDEBAR_TOKENS,
  ...NT_EDITOR_TOKENS,
  ...NT_TABBAR_TOKENS,
  ...NT_STATUSBAR_TOKENS,
  ...NT_PANEL_TOKENS,
  ...NT_OVERLAY_TOKENS,
  ...NT_SHARED_TOKENS,
] as const;

export type NtSemanticToken = (typeof NT_SEMANTIC_TOKENS)[number];

export const NT_COMPONENT_TOKENS = [
  '--nt-badge-bg',   // alias to --nt-prim-accent
  '--nt-badge-fg',   // alias to #fff / on-accent
] as const;

export type NtComponentToken = (typeof NT_COMPONENT_TOKENS)[number];

export type NtToken = NtPrimitiveToken | NtSemanticToken | NtComponentToken;

/**
 * Token documentation for extension API.
 */
export const NT_TOKEN_DOCS: Record<NtToken, string> = {
  // Layer 1
  '--nt-prim-bg-base': 'Raw editor background from theme (settings.background).',
  '--nt-prim-bg-elevated': 'Elevated surface bg (solidified gutterBackground or bg-base).',
  '--nt-prim-fg-base': 'Raw foreground (settings.foreground).',
  '--nt-prim-fg-muted': 'Muted foreground at 60% opacity.',
  '--nt-prim-fg-subtle': 'Subtle foreground at 45% (ignored/disabled).',
  '--nt-prim-accent': 'Accent color (caret || selection).',
  '--nt-prim-border': 'Subtle border (fg @ 15%).',
  '--nt-prim-border-strong': 'Strong border (fg @ 30%).',
  '--nt-prim-selection': 'Selection background.',
  '--nt-prim-selection-match': 'Selection-match highlight.',
  '--nt-prim-cursor': 'Cursor/caret color.',
  '--nt-prim-line-highlight': 'Active line highlight (blended).',
  // Title bar
  '--nt-titlebar-bg': 'Title bar background.',
  '--nt-titlebar-fg': 'Title bar foreground (text/icons).',
  '--nt-titlebar-border': 'Bottom border of title bar.',
  // Activity bar
  '--nt-activitybar-bg': 'Activity bar background.',
  '--nt-activitybar-fg': 'Inactive activity icon.',
  '--nt-activitybar-fg-active': 'Active activity icon.',
  '--nt-activitybar-indicator': 'Active indicator accent.',
  '--nt-activitybar-border': 'Right border of activity bar.',
  // Sidebar
  '--nt-sidebar-bg': 'Sidebar + explorer panel background.',
  '--nt-sidebar-fg': 'Sidebar text.',
  '--nt-sidebar-header-bg': 'Sidebar header bg (alias to sidebar-bg by default).',
  '--nt-sidebar-border': 'Right / internal borders of sidebar.',
  // Editor
  '--nt-editor-bg': 'EDITOR SURFACE bg — shared by content, gutter, minimap, empty.',
  '--nt-editor-fg': 'Editor code foreground.',
  '--nt-editor-gutter-fg': 'Gutter / line-number foreground.',
  '--nt-editor-line-highlight': 'Active line highlight.',
  '--nt-editor-selection': 'Selection background in editor.',
  '--nt-editor-cursor': 'Caret color.',
  '--nt-editor-border': 'Border between editor and chrome.',
  // Tab bar
  '--nt-tabbar-bg': 'Tab bar strip background.',
  '--nt-tab-active-bg': 'Active tab bg (alias to editor-bg).',
  '--nt-tab-inactive-bg': 'Inactive tab bg.',
  '--nt-tab-border': 'Dividers between tabs.',
  '--nt-tab-active-border': 'Top accent on active tab.',
  // Status bar
  '--nt-statusbar-bg': 'Status bar background.',
  '--nt-statusbar-fg': 'Status bar foreground.',
  '--nt-statusbar-border': 'Top border of status bar.',
  // Panel
  '--nt-panel-bg': 'Bottom panel (terminal/output) background.',
  '--nt-panel-fg': 'Bottom panel foreground.',
  '--nt-panel-border': 'Top border of bottom panel.',
  // Overlay
  '--nt-overlay-bg': 'Overlay (palette/menu/tooltip) background.',
  '--nt-overlay-fg': 'Overlay foreground.',
  '--nt-overlay-border': 'Overlay border.',
  '--nt-overlay-shadow': 'Overlay shadow.',
  // Shared
  '--nt-hover-bg': 'Hover background (fg @ 10%).',
  '--nt-active-bg': 'Active/pressed background (fg @ 20%).',
  '--nt-selected-bg': 'Selected background (selection token).',
  '--nt-scrollbar-thumb': 'Scrollbar thumb.',
  '--nt-scrollbar-thumb-hover': 'Scrollbar thumb on hover.',
  '--nt-focus-border': 'Focus outline (caret/selection).',
  '--nt-status-error': 'Error/status red.',
  '--nt-status-warning': 'Warning yellow.',
  '--nt-status-info': 'Info blue.',
  '--nt-status-success': 'Success green.',
  '--nt-untracked': 'Untracked file color (green/teal).',
  '--nt-ignored-fg': 'Ignored file dimmed color.',
  // Component
  '--nt-badge-bg': 'Badge background (alias to accent).',
  '--nt-badge-fg': 'Badge foreground (on-accent).',
};
