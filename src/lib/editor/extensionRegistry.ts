/**
 * Editor Extension Registry
 *
 * modular registry for CodeMirror 6 extensions contributed per feature.
 * Previously `commonExtensions.ts` was a single static array mixing core
 * editor setup, theming, keymaps, and optional features (minimap, git gutter,
 * breadcrumbs, etc.) in one place.
 *
 * Now features can contribute extensions declaratively. Core registers the
 * minimal editing capabilities; optional features (minimap, breadcrumbs,
 * sticky scroll, git gutter) register as contributions that can be enabled
 * or disabled without editing the core array.
 *
 * This is still a lightweight in-process registry — no extension host, no
 * sandbox. It simply establishes the structural boundary that makes additional
 * isolation possible.
 */

import type { Extension } from '@codemirror/state';

export interface EditorExtensionContribution {
  id: string;
  label: string;
  /** Priority — lower runs earlier in the extension array */
  priority: number;
  /** Factory returns the CodeMirror extension(s) for this contribution */
  create: () => Extension | Extension[] | Promise<Extension | Extension[]>;
  /** When false, this contribution is skipped */
  when?: () => boolean;
}

class EditorExtensionRegistry {
  private contributions = new Map<string, EditorExtensionContribution>();

  register(contrib: EditorExtensionContribution): { dispose: () => void } {
    if (this.contributions.has(contrib.id)) {
      console.warn(`[editorExtensionRegistry] overwriting: ${contrib.id}`);
    }
    this.contributions.set(contrib.id, contrib);
    return {
      dispose: () => {
        if (this.contributions.get(contrib.id) === contrib) this.contributions.delete(contrib.id);
      }
    };
  }

  getAll(): EditorExtensionContribution[] {
    return [...this.contributions.values()].sort((a, b) => a.priority - b.priority);
  }

  get(id: string): EditorExtensionContribution | undefined {
    return this.contributions.get(id);
  }

  async collectExtensions(): Promise<Extension[]> {
    const result: Extension[] = [];
    for (const c of this.getAll()) {
      if (c.when && !c.when()) continue;
      const ext = await c.create();
      if (Array.isArray(ext)) result.push(...ext);
      else result.push(ext);
    }
    return result;
  }
}

export const editorExtensionRegistry = new EditorExtensionRegistry();

// Built-in registrations (shared registry)
// Core extensions are registered here so they flow through the same path
// additional contributions would use. The existing COMMON_EXTENSIONS array
// stays as the fallback for code that hasn't migrated yet; new features should
// register here.

import { COMMON_EXTENSIONS } from './commonExtensions';

editorExtensionRegistry.register({
  id: 'core.common',
  label: 'Core editing (history, bracket matching, keymaps, etc.)',
  priority: 10,
  create: () => COMMON_EXTENSIONS
});

// Example optional contributions — structured so disabling is declarative:
editorExtensionRegistry.register({
  id: 'core.searchHighlight',
  label: 'Search result highlight',
  priority: 20,
  create: async () => {
    const m = await import('./searchResultHighlight');
    return m.searchResultHighlightExtensions();
  }
});