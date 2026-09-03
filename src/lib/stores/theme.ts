import { writable, get } from 'svelte/store';
import type { Readable } from 'svelte/store';
import { applyThemeVariables, THEMES } from '../themes';
import { THEME_KEY, SYSTEM_THEME } from '../constants';

function getSystemTheme(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function loadTheme(): string {
  if (typeof window === 'undefined') return SYSTEM_THEME;
  try {
    const t = localStorage.getItem(THEME_KEY) || SYSTEM_THEME;
    // Legacy values stored before named themes existed.
    if (t === 'light') return 'vscode-light';
    if (t === 'dark') return 'vscode-dark';
    return t;
  } catch {
    return SYSTEM_THEME;
  }
}

function computeIsDark(theme: string): boolean {
  if (theme === SYSTEM_THEME) return getSystemTheme();
  // Named themes know their darkness from THEMES; anything else (legacy ids)
  // falls back to a 'dark' substring match.
  return THEMES[theme]?.isDark ?? theme.includes('dark');
}

function applyThemeToDom(theme: string, isDark: boolean) {
  if (typeof window === 'undefined') return;
  const html = document.documentElement;
  html.classList.toggle('dark', isDark);
  html.classList.toggle('hc-dark', theme === 'hc-dark');
  html.classList.toggle('hc-light', theme === 'hc-light');
  applyThemeVariables(theme);
}

let themeState = { theme: loadTheme(), isDark: computeIsDark(loadTheme()) };
if (typeof window !== 'undefined') {
  applyThemeVariables(themeState.theme);
}

function createThemeStore(): Readable<{ theme: string; isDark: boolean }> & { setTheme: (theme: string) => void } {
  const store = writable(themeState);

  function setTheme(theme: string) {
    const isDark = computeIsDark(theme);
    themeState = { theme, isDark };
    store.set(themeState);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(THEME_KEY, theme);
        applyThemeToDom(theme, isDark);
      }
    } catch {}
  }

  if (typeof window !== 'undefined') {
    const systemListener = (e: MediaQueryListEvent) => {
      const current = get(store).theme;
      if (current === SYSTEM_THEME) {
        themeState = { theme: current, isDark: e.matches };
        store.set(themeState);
      }
    };

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', systemListener);

    // Keep DOM classes and CSS variables in sync when another window
    // changes the theme in localStorage.
    const storageListener = (e: StorageEvent) => {
      if (e.key === THEME_KEY && e.newValue !== null) {
        const theme = e.newValue;
        const isDark = computeIsDark(theme);
        themeState = { theme, isDark };
        store.set(themeState);
        applyThemeToDom(theme, isDark);
      }
    };

    window.addEventListener('storage', storageListener);
  }

  return {
    subscribe: store.subscribe,
    setTheme,
  };
}

export const themeStore = createThemeStore();
