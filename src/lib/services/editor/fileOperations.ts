/**
 * File Operations
 *
 * Central file open logic. The shell delegates here for reuse.
 */

import { invoke } from '@tauri-apps/api/core';
import { editorStore } from '../../stores/editor';
import { splitStore } from '../../stores/split';
import {
  UNTITLED_PREFIX,
  UNKNOWN_NAME,
  IMAGE_EXT_RE,
  BINARY_SENTINEL,
  LARGE_FILE_SENTINEL,
  generateId,
} from '../../constants';
import { fileService } from '../fileService';
import { createCancelableLoader } from '../../utils/cancelableLoader';

const fileOpenLoader = createCancelableLoader<any>();

/**
 * Create a new untitled text file and add it to the active pane.
 */
export function handleNewTextFile(): void {
  let count = 1;
  const tabsSnapshot = editorStore.getTabsSnapshot();
  while (tabsSnapshot.some((t: any) => t.path === `Untitled-${count}`)) count++;
  const name = `Untitled-${count}`;
  const id = `tab-${Date.now()}`;
  const tab = { id, path: name, name, content: '', language: 'plaintext', isPreview: false };
  editorStore.addTab(tab);
  editorStore.setActiveTab(id);
  const splitSnap = splitStore.getSnapshot();
  const activePaneId = (splitSnap as any).activePaneId;
  if (activePaneId) {
    splitStore.addTabToPane(activePaneId, {
      ...tab,
      originalContent: '',
      isModified: false,
      lastAccessed: Date.now(),
      status: 'active',
    } as any);
  }
}

/**
 * Open a file and add it to the active split pane.
 * The tab opens immediately and content streams in the background.
 * This is the single entry point for every file-open path.
 */
export async function openFileInActivePane(filePath: string): Promise<void> {
  const splitSnap = splitStore.getSnapshot();
  const activePaneId = (splitSnap as any).activePaneId;
  const pane = activePaneId ? (splitSnap as any).panes[activePaneId] : null;

  if (pane) {
    const existing = pane.tabs.find((t: any) => t.path === filePath);
    if (existing) {
      splitStore.setActivePaneTab(activePaneId, existing.id);
      editorStore.setActiveTab(existing.id);
      if (existing.content === null && !existing.isLoading) {
        const tabId = existing.id;
        const path = existing.path;
        editorStore.setTabLoading(tabId, true);
        fileOpenLoader
          .load(async () => {
            try {
              return await invoke<string>('read_file_text', { path });
            } catch (e) {
              if (String(e) === BINARY_SENTINEL) return { __error: 'binary' as const };
              if (String(e) === LARGE_FILE_SENTINEL) {
                const chunked = await invoke<any>('read_file_chunked', { path });
                return { __error: 'large' as const, content: chunked.content };
              }
              throw e;
            }
          })
          .then((result) => {
            if (result === undefined) return;
            if (result && typeof result === 'object' && '__error' in result) {
              if (result.__error === 'binary') {
                editorStore.setTabUnsupported(tabId, true);
                editorStore.setInitialContent(tabId, '');
              } else if (result.__error === 'large') {
                editorStore.setInitialContent(tabId, result.content);
                editorStore.updateTab(tabId, { isLargeFile: true, isPreview: true });
              }
            } else if (typeof result === 'string') {
              editorStore.setInitialContent(tabId, result);
            }
            editorStore.setTabLoading(tabId, false);
            const updatedTab = editorStore.getTabsSnapshot().find((t: any) => t.id === tabId);
            if (updatedTab) splitStore.updateTabInAllPanes(updatedTab);
          })
          .catch((err) => {
            console.error('Failed to reload suspended tab:', err);
            editorStore.setTabLoading(tabId, false);
          });
      }
      return;
    }
  }

  const fileName = filePath.split(/[/\\]/).pop() || UNKNOWN_NAME;
  const isImage = IMAGE_EXT_RE.test(fileName);
  const id = generateId('tab');

  let tabToReplaceId: string | null = null;
  const currentPane = activePaneId ? (splitSnap as any).panes[activePaneId] : null;
  if (currentPane && currentPane.activeTabId) {
    const activeTabObj = currentPane.tabs.find((t: any) => t.id === currentPane.activeTabId);
    if (activeTabObj && !activeTabObj.isModified) {
      const isUntitledWithContent =
        activeTabObj.path.startsWith(UNTITLED_PREFIX) &&
        activeTabObj.content &&
        activeTabObj.content.trim() !== '';
      if (!isUntitledWithContent) {
        tabToReplaceId = activeTabObj.id;
      }
    }
  }

  const tab = {
    id,
    path: filePath,
    name: fileName,
    content: null as string | null,
    language: isImage ? 'image' : 'plaintext',
    languageDetected: false,
    isPreview: tabToReplaceId !== null,
    isLargeFile: false,
    isLoading: !isImage,
  };

  if (tabToReplaceId) editorStore.closeTabEverywhere(tabToReplaceId);
  editorStore.addTab(tab as any);
  editorStore.setActiveTab(id);
  if (activePaneId) {
    if (tabToReplaceId) {
      splitStore.replaceTabInPane(activePaneId, tabToReplaceId, {
        ...tab,
        originalContent: null,
        isModified: false,
        lastAccessed: Date.now(),
        status: 'loaded',
      } as any);
    } else {
      splitStore.addTabToPane(activePaneId, {
        ...tab,
        originalContent: null,
        isModified: false,
        lastAccessed: Date.now(),
        status: 'loaded',
      } as any);
    }
  }

  if (isImage) return;

  const language = await fileService.detectLanguage(filePath).catch(() => 'plaintext');
  editorStore.updateTab(id, { language, languageDetected: true });
  splitStore.updateTabInAllPanes({ id, language, languageDetected: true } as any);

  const content = await fileOpenLoader.load(async () => {
    try {
      return await fileService.readText(filePath);
    } catch (e) {
      if (String(e) === BINARY_SENTINEL) return { __error: 'binary' as const };
      if (String(e) === LARGE_FILE_SENTINEL) {
        const chunked = await fileService.readChunked(filePath);
        return { __error: 'large' as const, content: chunked.content };
      }
      throw e;
    }
  });

  if (content === undefined) return;

  if (content && typeof content === 'object' && '__error' in content) {
    if (content.__error === 'binary') {
      editorStore.setTabUnsupported(id, true);
      editorStore.setInitialContent(id, '');
      editorStore.setTabLoading(id, false);
      splitStore.updateTabInAllPanes({ id, isUnsupported: true, isLoading: false } as any);
    } else if (content.__error === 'large') {
      editorStore.setInitialContent(id, content.content);
      editorStore.updateTab(id, { isLargeFile: true, isPreview: true });
      editorStore.setTabLoading(id, false);
      splitStore.updateTabInAllPanes({ id, isLargeFile: true, isPreview: true } as any);
    }
  } else if (typeof content === 'string') {
    editorStore.setInitialContent(id, content);
    editorStore.setTabLoading(id, false);
    splitStore.updateTabInAllPanes(editorStore.getTabsSnapshot().find((t: any) => t.id === id) || ({ id } as any));
    fileService
      .getEncodingInfo(filePath)
      .then((info) => {
        editorStore.updateTab(id, { encoding: info.encoding, lineEnding: info.line_ending });
        splitStore.updateTabInAllPanes({ id, encoding: info.encoding, lineEnding: info.line_ending } as any);
      })
      .catch(() => {});
  }
}
