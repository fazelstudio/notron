/**
 * Main
 *
 * Application entry point. Applies theme and mounts the shell.
 */

import { mount } from 'svelte';
import './app.css';
import { THEMES } from './lib/theme/registry';
import './lib/theme/commands';
import './lib/icon-theme';
import '../extensions/icon-theme-material/src/extension';

// Auto-discover built-in extensions without hardcode.
// Each folder under `extensions/*/src/extension.ts` is auto-registered.
const builtInExtensions = (import.meta as any).glob('../extensions/*/src/extension.ts', { eager: true });
void builtInExtensions;

// Load the shell only after built-in extensions have contributed their themes.
// This keeps the first token application identical to subsequent theme changes.
const { default: App } = await import('./App.svelte');

// Pre-emptively apply the stored theme class before the app mounts to
// avoid a flash of the wrong color scheme. The dark-theme list is derived
// from THEMES so it stays in sync with the theme catalog.
(function preloadTheme() {
  try {
    const stored = localStorage.getItem('notron_theme');
    const theme = stored || 'system';
    const darkThemes = Object.entries(THEMES)
      .filter(([, t]) => t.isDark)
      .map(([id]) => id);
    const isDark = theme.includes('dark') ||
      darkThemes.includes(theme) ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const html = document.documentElement;
    html.classList.toggle('dark', isDark);
  } catch {
    // fallback: no-op
  }
})();

const app = mount(App, {
  target: document.getElementById('root')!,
});

export default app;
