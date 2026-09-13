/**
 * Palette
 *
 * State store for palette.
 */

import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { Fzf } from 'fzf';
import { FZF_LIMIT, MAX_PALETTE_INDEX_FILES, PALETTE_CACHE_TTL_MS, DEFAULT_EXCLUDE_DIRS } from '../constants';

export interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  category: 'command' | 'file' | 'symbol' | 'recent';
  action: () => void;
  keywords?: string[];
  shortcut?: string;
}

// Cache raw file lists per workspace so re-opening the palette (or switching
// back to a workspace) never re-walks the whole tree.
const workspaceFileCache = new Map<string, { paths: string[]; ts: number }>();

function createPaletteStore() {
  const { subscribe, set } = writable({
    items: [] as PaletteItem[],
    fzfInstance: null as Fzf<PaletteItem[]> | null,
    isLoaded: false,
  });

  return {
    subscribe,
    initItems(items: PaletteItem[]) {
      const fzf = new Fzf(items, {
        selector: (item) => `${item.label} ${item.description ?? ''} ${item.keywords?.join(' ') ?? ''}`,
        limit: FZF_LIMIT,
      });
      set({ items, fzfInstance: fzf, isLoaded: true });
    },
    async loadWorkspaceFiles(workspacePath: string, baseCommands: PaletteItem[], openFileAction: (path: string) => void) {
      try {
        const now = Date.now();
        const cached = workspaceFileCache.get(workspacePath);
        let files: string[];
        if (cached && now - cached.ts < PALETTE_CACHE_TTL_MS) {
          files = cached.paths;
        } else {
          files = await invoke<string[]>('list_all_files', {
            path: workspacePath,
            excludeDirs: DEFAULT_EXCLUDE_DIRS,
            maxResults: MAX_PALETTE_INDEX_FILES,
          }).catch(() => []);
          workspaceFileCache.set(workspacePath, { paths: files, ts: now });
        }

        const fileItems: PaletteItem[] = files.map((path) => {
          const separator = path.includes('\\') ? '\\' : '/';
          const relativePath = path.replace(workspacePath + separator, '');
          return {
            id: `file:${path}`,
            label: path.split(/[/\\]/).pop() || path,
            description: relativePath,
            category: 'file',
            action: () => openFileAction(path),
          };
        });

        this.initItems([...baseCommands, ...fileItems]);
      } catch (err) {
        console.error('Failed to load workspace files for palette', err);
        this.initItems(baseCommands);
      }
    },
  };
}

export const paletteStore = createPaletteStore();
