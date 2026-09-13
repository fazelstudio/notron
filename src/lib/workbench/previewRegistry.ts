/**
 * Preview Registry
 *
 * Central store for file preview providers.
 * Each provider declares which files it handles and how to toggle
 * between code and preview. The editor queries this registry
 * instead of hardcoding checks for specific extensions.
 */

import { editorStore } from '../stores/editor';
import { splitStore } from '../stores/split';
import { commandRegistry } from '../commands/registry';

export type PreviewViewMode = string;

export interface PreviewContribution {
  /** Unique id, e.g. markdown, svg */
  id: string;
  /** Display label */
  label: string;
  /** File extensions without dot, lowercased */
  fileExtensions: string[];
  /** Optional language ids */
  languageIds?: string[];
  /** Available view modes for this preview */
  viewModes: PreviewViewMode[];
  /** Default mode */
  defaultMode: PreviewViewMode;
  /** Read current mode from a tab */
  getMode: (tab: any) => PreviewViewMode | undefined;
  /** Write mode to a tab */
  setMode: (tabId: string, mode: PreviewViewMode) => void;
  /** Labels for each mode */
  getLabel: (mode: PreviewViewMode) => string;
  /** Menu items for the toggle */
  getMenuModes: () => PreviewViewMode[];
  priority: number;
}

class PreviewRegistry {
  private items: PreviewContribution[] = [];

  register(item: PreviewContribution): { dispose: () => void } {
    this.items.push(item);
    this.items.sort((a, b) => a.priority - b.priority);
    return {
      dispose: () => {
        this.items = this.items.filter((i) => i !== item);
      }
    };
  }

  getAll(): PreviewContribution[] {
    return [...this.items];
  }

  getForFile(path: string, language?: string): PreviewContribution | undefined {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const lang = language?.toLowerCase();
    // Prefer language match first, then extension.
    for (const item of this.items) {
      if (lang && item.languageIds?.includes(lang)) return item;
    }
    for (const item of this.items) {
      if (ext && item.fileExtensions.includes(ext)) return item;
    }
    return undefined;
  }

  hasPreview(path: string, language?: string): boolean {
    return !!this.getForFile(path, language);
  }
}

export const previewRegistry = new PreviewRegistry();

// Default providers for markdown and svg.
// These replace the previous hardcoded .endsWith checks in SplitEditorPane.
previewRegistry.register({
  id: 'markdown',
  label: 'Markdown',
  fileExtensions: ['md', 'markdown'],
  languageIds: ['markdown'],
  viewModes: ['preview', 'code', 'split'],
  defaultMode: 'preview',
  getMode: (tab: any) => tab?.mdViewMode,
  setMode: (tabId: string, mode: string) => {
    editorStore.updateTab(tabId, { mdViewMode: mode as any });
    splitStore.updateTabInAllPanes({ id: tabId, mdViewMode: mode } as any);
  },
  getLabel: (mode: string) => {
    if (mode === 'preview') return 'Markdown Preview';
    if (mode === 'code') return 'Text Editor';
    if (mode === 'split') return 'Text & Preview';
    return mode;
  },
  getMenuModes: () => ['preview', 'code', 'split'],
  priority: 10
});

previewRegistry.register({
  id: 'svg',
  label: 'SVG',
  fileExtensions: ['svg'],
  languageIds: ['svg'],
  viewModes: ['image', 'code', 'split'],
  defaultMode: 'image',
  getMode: (tab: any) => tab?.svgViewMode,
  setMode: (tabId: string, mode: string) => {
    editorStore.updateTab(tabId, { svgViewMode: mode as any });
    splitStore.updateTabInAllPanes({ id: tabId, svgViewMode: mode } as any);
  },
  getLabel: (mode: string) => {
    if (mode === 'image') return 'Image Preview';
    if (mode === 'code') return 'Text Editor';
    if (mode === 'split') return 'Preview & Text';
    return mode;
  },
  getMenuModes: () => ['image', 'code', 'split'],
  priority: 20
});

// Commands so extensions can control preview via the registry.
function activeTab() {
  const tabs = editorStore.getTabsSnapshot();
  const id = editorStore.getActiveTabIdSnapshot();
  return tabs.find((t: any) => t.id === id) ?? null;
}

commandRegistry.register({
  id: 'workbench.action.preview.showCode',
  label: 'Preview: Show Code',
  category: 'View',
  action: () => {
    const tab = activeTab();
    if (!tab) return;
    const p = previewRegistry.getForFile(tab.path, tab.language);
    if (!p) return;
    const codeMode = p.viewModes.includes('code') ? 'code' : p.defaultMode;
    p.setMode(tab.id, codeMode);
  }
});

commandRegistry.register({
  id: 'workbench.action.preview.showPreview',
  label: 'Preview: Show Preview',
  category: 'View',
  action: () => {
    const tab = activeTab();
    if (!tab) return;
    const p = previewRegistry.getForFile(tab.path, tab.language);
    if (!p) return;
    const previewMode = p.viewModes.find((m) => m !== 'code') ?? p.defaultMode;
    p.setMode(tab.id, previewMode);
  }
});

commandRegistry.register({
  id: 'workbench.action.preview.showSplit',
  label: 'Preview: Show Split',
  category: 'View',
  action: () => {
    const tab = activeTab();
    if (!tab) return;
    const p = previewRegistry.getForFile(tab.path, tab.language);
    if (!p || !p.viewModes.includes('split')) return;
    p.setMode(tab.id, 'split');
  }
});
