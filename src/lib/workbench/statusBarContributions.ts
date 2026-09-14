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
import { previewRegistry } from './previewRegistry';

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
      const active = tabs.find((t) => t.id === activeId) as any;
      if (!active) return null;
      // Restored sessions may miss the flag; treat undefined as detected when language is present.
      if (active.languageDetected === false) return null;
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
      const active = tabs.find((t) => t.id === activeId) as any;
      if (!active) return null;
      if (['welcome', 'settings', 'image', 'image-diff', 'markdown-preview'].includes(active.language)) return null;
      // Hide cursor when the active tab is rendered as a pure preview (no editor surface).
      if (!active.noPreview) {
        const preview = previewRegistry.getForFile(active.path, active.language);
        if (preview) {
          const mode = (preview.getMode(active) as string | undefined) ?? preview.defaultMode;
          const isPreviewOnly = mode !== 'code' && mode !== 'split';
          // Only suppress when the preview actually has a code alternative.
          if (isPreviewOnly && preview.viewModes.includes('code')) return null;
        } else {
          // Fallback for built-in types when registry lookup misses (e.g. untitled markdown).
          const low = (active.path || '').toLowerCase();
          if ((low.endsWith('.md') || low.endsWith('.markdown')) && (active.mdViewMode ?? 'preview') === 'preview') return null;
          if (low.endsWith('.svg') && (active.svgViewMode ?? 'image') === 'image') return null;
        }
      }
      // `languageDetected` gates the language label flicker; cursor should be visible
      // as soon as a file tab is active, even if detection hasn't finished.
      const cur = editorStore.getCursor(activeId!);
      if (!cur) return `Ln 1, Col 1`;
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
      const active = tabs.find((t) => t.id === activeId) as any;
      if (!active) return null;
      if (active.languageDetected === false) return null;
      if (['welcome', 'settings', 'image', 'image-diff', 'markdown-preview'].includes(active.language)) return null;
      return active.encoding || 'UTF-8';
    }
  });
}

// Populate registry on import.
initStatusBarContributions();
