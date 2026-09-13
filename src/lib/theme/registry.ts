/**
 * Registry
 *
 * Runtime theme catalog populated by built-in and installed extensions.
 */

export interface ThemeInfo {
  extension: any;
  isDark: boolean;
  label: string;
  settings?: any;
  uiTheme?: 'light' | 'dark';
  isHighContrast?: boolean;
}

export const THEMES: Record<string, ThemeInfo> = {};

export function registerTheme(id: string, info: ThemeInfo): void {
  THEMES[id] = info;
}

/** Return the same complete catalog used by Settings and the theme picker. */
export function getThemeOptions(): Array<{ id: string; label: string; uiTheme: 'light' | 'dark' }> {
  return Object.entries(THEMES)
    .map(([id, info]) => ({ id, label: info.label, uiTheme: info.uiTheme ?? (info.isDark ? 'dark' : 'light') }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function getTheme(id: string): ThemeInfo | undefined {
  return THEMES[id];
}

export function getAllThemes(): Record<string, ThemeInfo> {
  return { ...THEMES };
}

export function getThemeExtension(themeId: string, isDark: boolean) {
  if (themeId === 'system') {
    const fallback = isDark ? 'notron-dark' : 'notron-light';
    return THEMES[fallback]?.extension ?? THEMES['notron-dark'].extension;
  }
  return THEMES[themeId]?.extension ?? THEMES['notron-dark'].extension;
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
