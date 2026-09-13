/**
 * Status Bar Contributions
 *
 * Registers built-in status bar items.
 * Each entry provides derived text so the bar updates reactively.
 */

import { statusBarRegistry } from './statusBarRegistry';
import { editorStore } from '../stores/editor';
import { uiStore } from '../stores/ui';
import { formatLanguageName } from '../utils/languageDetector';

let initialized = false;

export function initStatusBarContributions(): void {
  if (initialized) return;
  initialized = true;

  statusBarRegistry.register({
    id: 'status.saveStatus',
    alignment: 'left',
    priority: 100,
    getText: () => {
      let v: string | null = null;
      editorStore.saveStatus.subscribe((x) => (v = x))();
      return v ?? 'Ready';
    }
  });

  statusBarRegistry.register({
    id: 'status.language',
    alignment: 'left',
    priority: 90,
    getText: () => {
      const tabs = editorStore.getTabsSnapshot();
      const activeId = editorStore.getActiveTabIdSnapshot();
      const active = tabs.find((t) => t.id === activeId);
      if (!active || !active.languageDetected) return null;
      if (['welcome', 'settings', 'image', 'image-diff', 'markdown-preview'].includes(active.language)) return null;
      return formatLanguageName(active.language);
    }
  });

  statusBarRegistry.register({
    id: 'status.global',
    alignment: 'left',
    priority: 80,
    getText: () => {
      const v = uiStore.getSnapshot().globalStatus;
      if (!v) return null;
      return v.length > 40 ? v.slice(0, 40) + '...' : v;
    },
    getTooltip: () => uiStore.getSnapshot().globalStatus ?? undefined
  });

  statusBarRegistry.register({
    id: 'status.cursor',
    alignment: 'right',
    priority: 100,
    getText: () => {
      const tabs = editorStore.getTabsSnapshot();
      const activeId = editorStore.getActiveTabIdSnapshot();
      const active = tabs.find((t) => t.id === activeId);
      if (!active || !active.languageDetected) return null;
      if (['welcome', 'settings', 'image', 'image-diff', 'markdown-preview'].includes(active.language)) return null;
      const cur = editorStore.getCursor(activeId!);
      if (!cur) return null;
      return `Ln ${cur.line}, Col ${cur.column}`;
    }
  });

  statusBarRegistry.register({
    id: 'status.encoding',
    alignment: 'right',
    priority: 90,
    getText: () => {
      const tabs = editorStore.getTabsSnapshot();
      const activeId = editorStore.getActiveTabIdSnapshot();
      const active = tabs.find((t) => t.id === activeId);
      if (!active || !active.languageDetected) return null;
      if (['welcome', 'settings', 'image', 'image-diff', 'markdown-preview'].includes(active.language)) return null;
      return active.encoding || 'UTF-8';
    }
  });
}

// Populate registry on import.
initStatusBarContributions();
