/**
 * Theme
 *
 * State store for theme.
 */

import { writable, get } from 'svelte/store';
import type { Readable } from 'svelte/store';
import { getTheme } from '../theme/registry';
import { THEME_KEY, SYSTEM_THEME } from '../constants';
import { applyNtTheme } from '../theme/theme-bridge';

function getSystemTheme(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function loadTheme(): string {
  if (typeof window === 'undefined') return SYSTEM_THEME;
  try {
    const t = localStorage.getItem(THEME_KEY) || SYSTEM_THEME;
    return t;
  } catch {
    return SYSTEM_THEME;
  }
}

function computeIsDark(theme: string): boolean {
  if (theme === SYSTEM_THEME) return getSystemTheme();
  const info = getTheme(theme);
  if (info) return !!info.isDark;
  return theme.includes('dark');
}

function applyThemeToDom(theme: string, isDark: boolean) {
  if (typeof window === 'undefined') return;
  const html = document.documentElement;
  html.classList.toggle('dark', isDark);
  applyNtTheme(theme);
}

let themeState = { theme: loadTheme(), isDark: computeIsDark(loadTheme()) };
if (typeof window !== 'undefined') {
  applyNtTheme(themeState.theme);
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
