/**
 * Registry
 *
 * Runtime theme catalog. After the SDK migration the canonical store lives in
 * `notron-sdk` (`theming.__getContributedThemes`) — this module remains as a
 * compatibility adapter so existing shell code (`THEMES`, `getTheme`) keeps
 * working while extensions register only via `notron-sdk`.
 */

import { __getContributedThemes, __registerTheme } from 'notron-sdk';

export interface ThemeInfo {
  extension: any;
  isDark: boolean;
  label: string;
  settings?: any;
  uiTheme?: 'light' | 'dark';
  isHighContrast?: boolean;
}

export const THEMES: Record<string, ThemeInfo> = {};

function toThemeInfo(c: any): ThemeInfo {
  return {
    extension: c.extension,
    settings: c.settings,
    isDark: c.isDark ?? c.uiTheme === 'dark',
    label: c.label,
    uiTheme: (c.uiTheme as any) ?? (c.isDark ? 'dark' : 'light'),
    isHighContrast: c.isHighContrast,
  };
}

function mergedThemes(): Record<string, ThemeInfo> {
  const out: Record<string, ThemeInfo> = { ...THEMES };
  try {
    for (const c of __getContributedThemes()) {
      if (!out[c.id] || !out[c.id].extension) {
        // SDK entry may carry the actual CodeMirror extension payload.
        if (c.extension !== undefined || c.settings !== undefined || c.isDark !== undefined) {
          out[c.id] = toThemeInfo(c);
        } else if (!out[c.id]) {
          // Manifest-only entry (no runtime payload yet) — keep placeholder so
          // theme picker lists it; extension will fill payload on activate.
          out[c.id] = {
            extension: undefined,
            settings: undefined,
            isDark: c.uiTheme === 'dark',
            label: c.label,
            uiTheme: c.uiTheme as any,
            isHighContrast: c.isHighContrast,
          } as any;
        }
      }
    }
  } catch {}
  return out;
}

export function registerTheme(id: string, info: ThemeInfo): void {
  THEMES[id] = info;
  // Also mirror into SDK so SDK query APIs see core-registered themes (e.g. in tests).
  try {
    __registerTheme({
      id,
      label: info.label,
      uiTheme: (info.uiTheme ?? (info.isDark ? 'dark' : 'light')) as any,
      extension: info.extension,
      settings: info.settings,
      isDark: info.isDark,
      isHighContrast: info.isHighContrast,
      path: `./themes/${id}.ts`,
    } as any);
  } catch {}
}

/** Return the same complete catalog used by Settings and the theme picker. */
export function getThemeOptions(): Array<{ id: string; label: string; uiTheme: 'light' | 'dark' }> {
  return Object.entries(mergedThemes())
    .map(([id, info]) => ({ id, label: info.label, uiTheme: info.uiTheme ?? (info.isDark ? 'dark' : 'light') }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function getTheme(id: string): ThemeInfo | undefined {
  const m = mergedThemes();
  return m[id];
}

export function getAllThemes(): Record<string, ThemeInfo> {
  return mergedThemes();
}

export function getThemeExtension(themeId: string, isDark: boolean) {
  const m = mergedThemes();
  const pickByDark = (dark: boolean): any | undefined => {
    const entries = Object.entries(m);
    // Prefer theme with extension and matching darkness
    const withExt = entries.filter(([, info]) => !!info.extension && info.isDark === dark);
    if (withExt.length > 0) return withExt[0][1].extension;
    const anyDark = entries.filter(([, info]) => info.isDark === dark);
    if (anyDark.length > 0) return anyDark[0][1].extension;
    const anyWithExt = entries.find(([, info]) => !!info.extension);
    return anyWithExt?.[1].extension;
  };
  if (themeId === 'system') {
    return pickByDark(isDark);
  }
  if (m[themeId]?.extension) return m[themeId].extension;
  // Fallback to matching darkness theme instead of hard-coded 'notron-dark'
  const fallback = pickByDark(isDark);
  if (fallback) return fallback;
  const anyWithExt = Object.values(m).find((info) => !!info.extension);
  return anyWithExt?.extension;
}

export function adjustColorOpacity(hex: string, alpha: number): string {
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
