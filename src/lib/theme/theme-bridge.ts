/**
 * Theme Bridge
 *
 * Bridges CodeMirror theme settings to CSS tokens for the shell and editor.
 */

import { getTheme, getAllThemes } from './registry';
import { DEFAULT_THEME } from '../constants';
import { highContrastSemanticAliases } from './high-contrast';

// Color helpers

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || !hex.startsWith('#')) return null;
  if (hex.length === 4) {
    return {
      r: parseInt(hex[1] + hex[1], 16),
      g: parseInt(hex[2] + hex[2], 16),
      b: parseInt(hex[3] + hex[3], 16),
    };
  }
  if (hex.length >= 7) {
    return {
      r: parseInt(hex.substring(1, 3), 16),
      g: parseInt(hex.substring(3, 5), 16),
      b: parseInt(hex.substring(5, 7), 16),
    };
  }
  return null;
}

function toHexByte(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
}

function tint(base: string, overlay: string, alpha: number): string {
  const baseRgb = hexToRgb(base);
  const overlayRgb = hexToRgb(overlay);
  if (!baseRgb || !overlayRgb) return base;
  return `#${toHexByte(overlayRgb.r * alpha + baseRgb.r * (1 - alpha))}${toHexByte(overlayRgb.g * alpha + baseRgb.g * (1 - alpha))}${toHexByte(overlayRgb.b * alpha + baseRgb.b * (1 - alpha))}`;
}

function solidify(color: string, background: string): string {
  if (!color) return color;
  let r = 0, g = 0, b = 0, a = 1;
  const m = color.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
    if (parts.length >= 3) {
      r = parts[0]; g = parts[1]; b = parts[2];
      a = /^rgba/i.test(m[0]) && parts.length >= 4 ? parts[3] : 1;
    } else {
      return color;
    }
  } else if (/^#[0-9a-f]{8}$/i.test(color)) {
    r = parseInt(color.substring(1, 3), 16);
    g = parseInt(color.substring(3, 5), 16);
    b = parseInt(color.substring(5, 7), 16);
    a = parseInt(color.substring(7, 9), 16) / 255;
  } else if (/^#[0-9a-f]{6}$/i.test(color) || /^#[0-9a-f]{3}$/i.test(color)) {
    return color;
  } else if (color === 'transparent') {
    a = 0;
  } else {
    return color;
  }
  if (a >= 1) {
    return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
  }
  const bg = hexToRgb(background) || { r: 0, g: 0, b: 0 };
  return `#${toHexByte(r * a + bg.r * (1 - a))}${toHexByte(g * a + bg.g * (1 - a))}${toHexByte(b * a + bg.b * (1 - a))}`;
}

function adjustOpacity(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith('#')) return hex;
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length >= 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  } else {
    return hex;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}



export interface NormalizedPrimitives {
  bgBase: string;
  bgElevated: string;
  fgBase: string;
  fgMuted: string;
  fgSubtle: string;
  accent: string;
  border: string;
  borderStrong: string;
  selection: string;
  selectionMatch: string;
  cursor: string;
  lineHighlight: string;
  gutterFg: string;
  isDark: boolean;
  isHighContrast: boolean;
}

/**
 * Extract raw settings with fallback for missing gutter background.
 */
export function extractPrimitives(themeName: string): NormalizedPrimitives | null {
  if (typeof window === 'undefined') return null;

  let effectiveTheme = themeName;
  if (themeName === 'system') {
    const isDarkOS = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (isDarkOS) {
      effectiveTheme = DEFAULT_THEME;
    } else {
      // Pick first light theme from registry instead of hard-coded id.
      try {
        const all = getAllThemes();
        const light = Object.entries(all).find(([, t]) => !t.isDark && !!t.settings);
        effectiveTheme = light?.[0] ?? 'notron-light';
      } catch {
        effectiveTheme = 'notron-light';
      }
    }
  }

  const themeObj = getTheme(effectiveTheme) as any;
  const s = themeObj?.settings;
  if (!s) return null;

  const isDark = !!themeObj.isDark;
  const isHC = themeObj.isHighContrast === true;

  const bgBase: string = s.background;
  const gutterBgRaw: string | undefined = s.gutterBackground;
  const bgElevated: string = gutterBgRaw ? solidify(gutterBgRaw, bgBase) : bgBase;

  const fgBase: string = s.foreground;
  const accent: string = s.caret || s.selection || '#0078d4';
  const border = adjustOpacity(fgBase, 0.15);
  const borderStrong = adjustOpacity(fgBase, 0.30);
  const lineHighlightRaw: string | undefined = s.lineHighlight || s.gutterBackground;
  const lineHighlight: string = lineHighlightRaw ? solidify(lineHighlightRaw, bgBase) : bgBase;

  return {
    bgBase,
    bgElevated,
    fgBase,
    fgMuted: adjustOpacity(fgBase, 0.60),
    fgSubtle: adjustOpacity(fgBase, 0.45),
    accent,
    border,
    borderStrong,
    selection: s.selection || accent,
    selectionMatch: s.selectionMatch || adjustOpacity(accent, 0.35),
    cursor: s.caret || accent,
    lineHighlight,
    gutterFg: s.gutterForeground ? solidify(s.gutterForeground, bgBase) : adjustOpacity(fgBase, 0.45),
    isDark,
    isHighContrast: isHC,
  };
}

/**
 * Resolve semantic tokens from primitives.
 */
export function resolveSemanticTokens(prim: NormalizedPrimitives): Record<string, string> {
  const { bgBase, bgElevated, fgBase, accent, border, borderStrong, selection, cursor, lineHighlight, gutterFg, isDark, isHighContrast } = prim;

  if (isHighContrast) {
    const hcAliases = highContrastSemanticAliases();
    const shared: Record<string, string> = {
      '--nt-prim-bg-base': bgBase,
      '--nt-prim-bg-elevated': bgBase,
      '--nt-prim-fg-base': fgBase,
      '--nt-prim-fg-muted': fgBase,
      '--nt-prim-fg-subtle': fgBase,
      '--nt-prim-accent': accent,
      '--nt-prim-border': '#0078d4',
      '--nt-prim-border-strong': '#0078d4',
      '--nt-prim-selection': selection,
      '--nt-prim-selection-match': selection,
      '--nt-prim-cursor': cursor,
      '--nt-prim-line-highlight': bgBase,
      '--nt-editor-fg': fgBase,
      '--nt-editor-gutter-fg': gutterFg,
      '--nt-editor-line-highlight': bgBase,
      '--nt-editor-cursor': cursor,
      '--nt-sidebar-fg': fgBase,
      '--nt-titlebar-fg': fgBase,
      '--nt-activitybar-fg': adjustOpacity(fgBase, 0.60),
      '--nt-activitybar-fg-active': fgBase,
      '--nt-activitybar-indicator': accent,
      '--nt-statusbar-fg': fgBase,
      '--nt-panel-fg': fgBase,
      '--nt-overlay-fg': fgBase,
      '--nt-hover-bg': adjustOpacity(fgBase, 0.10),
      '--nt-active-bg': adjustOpacity(fgBase, 0.20),
      '--nt-scrollbar-thumb': adjustOpacity(fgBase, 0.35),
      '--nt-scrollbar-thumb-hover': adjustOpacity(fgBase, 0.50),
      '--nt-focus-border': accent,
      '--nt-status-error': isDark ? '#f14c4c' : '#cc0000',
      '--nt-status-warning': isDark ? '#cca700' : '#9a6700',
      '--nt-status-info': '#3794ff',
      '--nt-status-success': isDark ? '#3fb950' : '#1a7f37',
      '--nt-untracked': isDark ? '#3fb950' : '#1a7f37',
      '--nt-ignored-fg': adjustOpacity(fgBase, 0.45),
      '--nt-badge-bg': accent,
      '--nt-badge-fg': '#ffffff',
      '--nt-tab-inactive-bg': bgBase,
      '--nt-tab-active-border': accent,
      '--nt-overlay-shadow': 'none',
    };
    return { ...hcAliases, ...shared };
  }

  const titlebarBg = tint(bgElevated, '#000000', isDark ? 0.30 : 0.07);
  const statusbarBg = isDark ? tint(bgBase, '#000000', 0.15) : selection;
  const tabInactiveBg = bgElevated;
  const tabActiveBg = bgBase; // active tab = editor surface

  return {
    '--nt-prim-bg-base': bgBase,
    '--nt-prim-bg-elevated': bgElevated,
    '--nt-prim-fg-base': fgBase,
    '--nt-prim-fg-muted': adjustOpacity(fgBase, 0.60),
    '--nt-prim-fg-subtle': adjustOpacity(fgBase, 0.45),
    '--nt-prim-accent': accent,
    '--nt-prim-border': border,
    '--nt-prim-border-strong': borderStrong,
    '--nt-prim-selection': selection,
    '--nt-prim-cursor': cursor,
    '--nt-prim-line-highlight': lineHighlight,

    '--nt-titlebar-bg': titlebarBg,
    '--nt-titlebar-fg': fgBase,
    '--nt-titlebar-border': border,

    // Activity bar
    '--nt-activitybar-bg': bgElevated,
    '--nt-activitybar-fg': adjustOpacity(fgBase, 0.60),
    '--nt-activitybar-fg-active': fgBase,
    '--nt-activitybar-indicator': accent,
    '--nt-activitybar-border': border,

    // Sidebar (header alias to sidebar unless theme explicitly differentiates)
    '--nt-sidebar-bg': bgElevated,
    '--nt-sidebar-fg': fgBase,
    '--nt-sidebar-header-bg': bgElevated,
    '--nt-sidebar-border': border,

    // Editor — unified color for gutter, content, and minimap track.
    '--nt-editor-bg': bgBase,
    '--nt-editor-fg': fgBase,
    '--nt-editor-gutter-fg': gutterFg,
    '--nt-editor-line-highlight': lineHighlight,
    '--nt-editor-selection': selection,
    '--nt-editor-cursor': cursor,
    '--nt-editor-border': border,

    // Tab bar
    '--nt-tabbar-bg': bgElevated,
    '--nt-tab-active-bg': tabActiveBg,
    '--nt-tab-inactive-bg': tabInactiveBg,
    '--nt-tab-border': border,
    '--nt-tab-active-border': accent,

    // Status bar
    '--nt-statusbar-bg': statusbarBg,
    '--nt-statusbar-fg': isDark ? fgBase : '#ffffff',
    '--nt-statusbar-border': border,

    // Panel
    '--nt-panel-bg': bgElevated,
    '--nt-panel-fg': fgBase,
    '--nt-panel-border': border,

    // Overlay
    '--nt-overlay-bg': bgElevated,
    '--nt-overlay-fg': fgBase,
    '--nt-overlay-border': border,
    '--nt-overlay-shadow': isDark
      ? '0 4px 12px rgba(0,0,0,0.40), 0 1px 3px rgba(0,0,0,0.30)'
      : '0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)',

    // Shared
    '--nt-hover-bg': adjustOpacity(fgBase, 0.10),
    '--nt-active-bg': adjustOpacity(fgBase, 0.20),
    '--nt-selected-bg': selection,
    '--nt-scrollbar-thumb': adjustOpacity(fgBase, 0.35),
    '--nt-scrollbar-thumb-hover': adjustOpacity(fgBase, 0.50),
    '--nt-focus-border': accent,
    '--nt-status-error': isDark ? '#f14c4c' : '#cc0000',
    '--nt-status-warning': isDark ? '#cca700' : '#9a6700',
    '--nt-status-info': '#3794ff',
    '--nt-status-success': isDark ? '#3fb950' : '#1a7f37',
    '--nt-untracked': isDark ? '#3fb950' : '#1a7f37',
    '--nt-ignored-fg': adjustOpacity(fgBase, 0.45),

    // Component
    '--nt-badge-bg': accent,
    '--nt-badge-fg': '#ffffff',
  };
}

/**
 * Set tokens as CSS properties and keep legacy aliases in sync.
 */
export function injectTokens(tokenMap: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  const html = document.documentElement;

  for (const [key, value] of Object.entries(tokenMap)) {
    html.style.setProperty(key, value);
  }
  const alias: Record<string, string> = {
    // bg
    '--bg-editor': tokenMap['--nt-editor-bg'],
    '--bg-canvas': tokenMap['--nt-editor-bg'],
    '--bg-sidebar': tokenMap['--nt-sidebar-bg'],
    '--bg-titlebar': tokenMap['--nt-titlebar-bg'],
    '--bg-panel': tokenMap['--nt-panel-bg'],
    '--bg-elevated': tokenMap['--nt-overlay-bg'],
    '--bg-surface': tokenMap['--nt-sidebar-bg'],
    '--bg-surface-2': tokenMap['--nt-overlay-bg'],
    '--bg-surface-3': tokenMap['--nt-tab-inactive-bg'], // approximations retained
    '--bg-surface-4': tokenMap['--nt-tab-inactive-bg'],
    '--bg-input': tokenMap['--nt-overlay-bg'], // input bg derived from overlay for now
    '--bg-statusbar': tokenMap['--nt-statusbar-bg'],
    '--bg-hover': tokenMap['--nt-hover-bg'],
    '--bg-active': tokenMap['--nt-active-bg'],
    '--bg-selected': tokenMap['--nt-selected-bg'],
    '--bg-selected-hover': tokenMap['--nt-selected-bg'],
    '--bg-disabled': 'var(--nt-active-bg)',

    // border
    '--border-subtle': tokenMap['--nt-prim-border'] || tokenMap['--nt-editor-border'],
    '--border-strong': tokenMap['--nt-prim-border-strong'],
    '--border-focus': tokenMap['--nt-focus-border'],
    '--border-disabled': tokenMap['--nt-prim-border'],

    // text
    '--text-primary': tokenMap['--nt-editor-fg'] || tokenMap['--nt-prim-fg-base'],
    '--text-secondary': 'var(--nt-prim-fg-muted)',
    '--text-muted': 'var(--nt-prim-fg-muted)',
    '--text-disabled': 'var(--nt-prim-fg-subtle)',
    '--text-placeholder': 'var(--nt-prim-fg-muted)',
    '--text-inverse': tokenMap['--nt-prim-bg-base'] ? adjustOpacity(tokenMap['--nt-prim-bg-base'], 1) : '#ffffff',
    '--text-on-accent': '#ffffff',
    '--text-on-error': '#ffffff',
    '--text-on-success': '#ffffff',
    '--color-text-ignored': tokenMap['--nt-ignored-fg'],
    '--color-untracked': tokenMap['--nt-untracked'],

    // accent / indicator
    '--accent': tokenMap['--nt-prim-accent'],
    '--accent-hover': 'var(--nt-prim-accent)',
    '--accent-active': 'var(--nt-prim-accent)',
    '--indicator-active': tokenMap['--nt-activitybar-indicator'],
    '--indicator-inactive': 'var(--nt-prim-fg-subtle)',

    // icons
    '--icon-primary': tokenMap['--nt-editor-fg'],
    '--icon-secondary': 'var(--nt-prim-fg-muted)',
    '--icon-muted': 'var(--nt-prim-fg-subtle)',
    '--icon-disabled': 'var(--nt-prim-fg-subtle)',
    '--icon-default': tokenMap['--nt-editor-fg'],
    '--icon-active': tokenMap['--nt-editor-fg'],
    '--icon-active-tab': tokenMap['--nt-editor-fg'],

    // scrollbar
    '--scrollbar-thumb': tokenMap['--nt-scrollbar-thumb'],
    '--scrollbar-thumb-hover': tokenMap['--nt-scrollbar-thumb-hover'],

    // status
    '--color-status-error': tokenMap['--nt-status-error'],
    '--color-status-warning': tokenMap['--nt-status-warning'],
    '--color-status-info': tokenMap['--nt-status-info'],
    '--color-status-success': tokenMap['--nt-status-success'],

    // shadow
    '--elevated-shadow-sm': '0 1px 2px rgba(0,0,0,0.12)',
    '--elevated-shadow': tokenMap['--nt-overlay-shadow'],
  };

  for (const [key, value] of Object.entries(alias)) {
    if (value) html.style.setProperty(key, value);
  }

}

/**
 * Apply theme by name and inject tokens.
 */
export function applyNtTheme(themeName: string): Record<string, string> | null {
  const prim = extractPrimitives(themeName);
  if (!prim) return null;
  const semantic = resolveSemanticTokens(prim);
  injectTokens(semantic);
  document.documentElement.toggleAttribute('data-nt-high-contrast', prim.isHighContrast);
  return semantic;
}
