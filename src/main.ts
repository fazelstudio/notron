/**
 * Main
 *
 * Application entry point. Applies theme and mounts the shell.
 */

import { mount } from 'svelte';
import './app.css';
import { getAllThemes } from './lib/theme/registry';
import { applyNtTheme } from './lib/theme/theme-bridge';
import { initSdkBridge } from './lib/platform/sdkBridge';
import { ExtensionHost, setExtensionsDelegate } from 'notron-sdk';
import { themeStore } from './lib/stores/theme';
import { discoverInstalledExtensions, setExtensionHost } from './lib/services/extensionService';
import { uiStore } from './lib/stores/ui';

// Bridge SDK delegates to core so extensions using `notron-sdk` talk to the real app.
initSdkBridge();

// Load built-in extensions via ExtensionHost — each `extensions/*/package.json`
// paired with `extensions/*/src/extension.ts` is a self-contained extension.
const rawModules = import.meta.glob('../extensions/*/src/extension.ts', { eager: true }) as Record<string, any>;
const rawManifests = import.meta.glob('../extensions/*/package.json', { eager: true }) as Record<string, any>;

const manifests: any[] = [];
const modules = new Map<string, any>();

for (const [manifestPath, mod] of Object.entries(rawManifests)) {
  const manifest = (mod as any).default ?? mod;
  // Ensure engines field for host compatibility check.
  if (!manifest.engines) manifest.engines = { notron: '^0.1.0' };
  const id: string = manifest.id;
  const base = manifestPath.replace('/package.json', '');
  const modulePath = `${base}/src/extension.ts`;
  const extModule = (rawModules as any)[modulePath];
  if (!extModule) {
    console.warn(`[main] no module for ${id} at ${modulePath}`);
    continue;
  }
  manifests.push(manifest);
  modules.set(id, extModule);
}

const host = new ExtensionHost({
  hostVersion: '0.1.0',
  isWorkspaceTrusted: () => {
    const state = uiStore.getSnapshot();
    return !state.explorerRoot || state.recentWorkspaces.includes(state.explorerRoot);
  },
});
host.register(manifests, modules);
setExtensionHost(host);
setExtensionsDelegate({
  getExtension: (id) => {
    const extension = host.getExtension(id);
    if (!extension) return undefined;
    return {
      id: extension.manifest.id,
      version: extension.manifest.version,
      publisher: extension.manifest.publisher,
      isActive: extension.activated,
      exports: extension.exports,
      packageJSON: extension.manifest,
    };
  },
  getAll: () => host.allExtensions.map((extension) => ({
    id: extension.manifest.id,
    version: extension.manifest.version,
    publisher: extension.manifest.publisher,
    isActive: extension.activated,
    exports: extension.exports,
    packageJSON: extension.manifest,
  })),
});
await discoverInstalledExtensions(uiStore.getSnapshot().explorerRoot || undefined);
await host.activateAll();

// Re-sync theme store after extensions have populated the theme registry.
// Without this, `themeStore` initially computed `isDark` via substring fallback
// (empty registry) and `applyNtTheme` at import time had no theme to apply.
try {
  const stored = localStorage.getItem('notron_theme') || 'system';
  themeStore.setTheme(stored);
} catch {}

// Expose for debugging and for HMR disposal.
if (typeof window !== 'undefined') {
  (window as any).__notronHost = host;
}

// Load the shell only after built-in extensions have contributed their themes.
// This keeps the first token application identical to subsequent theme changes.
const { default: App } = await import('./App.svelte');

// Pre-emptively apply the stored theme class before the app mounts to
// avoid a flash of the wrong color scheme. The dark-theme list is derived
// from the SDK registry so it stays in sync with the theme catalog.
(function preloadTheme() {
  try {
    const stored = localStorage.getItem('notron_theme');
    const theme = stored || 'system';
    const all = getAllThemes() as Record<string, { isDark: boolean }>;
    const darkThemes = Object.entries(all)
      .filter(([, t]: any) => (t as any).isDark)
      .map(([id]) => id);
    const isDark = theme.includes('dark') ||
      darkThemes.includes(theme) ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const html = document.documentElement;
    html.classList.toggle('dark', isDark);
    applyNtTheme(theme);
  } catch {
    // fallback: no-op
  }
})();

const app = mount(App, {
  target: document.getElementById('root')!,
});

export default app;
