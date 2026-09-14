/**
 * SDK Bridge
 *
 * Connects Notron core registries and stores to the public notron-sdk
 * delegates so built-in extensions using `import { commands, workspace, window } from 'notron-sdk'`
 * talk to the real application instead of in-memory fallbacks.
 */

import {
  setCommandDelegate,
  __setCommandMirror,
  setCommandContributionDelegate,
  __getCommandIds,
  commands,
  setViewsDelegate,
  setMenusDelegate,
  setConfigurationContributionDelegate,
} from 'notron-sdk';
import { setWorkspaceDelegate, __setWorkspaceFolders } from 'notron-sdk';
import { setWindowDelegate, __setActiveTextEditor, __setVisibleTextEditors } from 'notron-sdk';
import { setThemingDelegate, __setActiveTheme } from 'notron-sdk';
import { setActivityDelegate, type StatusBarItem as SdkStatusBarItem } from 'notron-sdk';
import { evaluateWhenClause } from 'notron-sdk';
import { Emitter } from 'notron-sdk/api/types';
import { commandRegistry } from '../commands/registry';
import { settingsStore } from '../stores/settings.svelte';
import { uiStore } from '../stores/ui';
import { editorStore } from '../stores/editor';
import { themeStore } from '../stores/theme';
import { notificationService } from '../services/notificationService';
import { dialogService } from '../services/dialogService';
import { activateExtensionsForEvent } from '../services/extensionService';
import { activityBarRegistry } from '../workbench/activityBarRegistry';
import { sidebarRegistry } from '../workbench/sidebarRegistry';
import { menuRegistry } from '../workbench/menuRegistry';
import { contextMenuRegistry } from '../workbench/contextMenuRegistry';
import { statusBarRegistry } from '../workbench/statusBarRegistry';
import { settingsRegistry } from '../workbench/settingsRegistry';
import { fileIpc } from './ipc';

// Shared emitter for configuration changes — forwarded to SDK workspace.
const configEmitter = new Emitter<any>();

// Patch settingsStore to emit SDK configuration events.
let bridgePatched = false;
function patchSettingsStore() {
  if (bridgePatched) return;
  bridgePatched = true;
  const origUpdate = settingsStore.updateSetting.bind(settingsStore);
  settingsStore.updateSetting = ((key: any, value: any, scope: any) => {
    const result = origUpdate(key, value, scope);
    configEmitter.fire({
      affectsConfiguration(section: string): boolean {
        return section === key || section === String(key).split('.').pop() || String(key).startsWith(section);
      },
    });
    return result;
  }) as any;

  const origApply = settingsStore.applyLoadedSettings.bind(settingsStore);
  settingsStore.applyLoadedSettings = ((global: any, workspace: any, workspaceId?: string) => {
    origApply(global, workspace, workspaceId);
    configEmitter.fire({
      affectsConfiguration(): boolean {
        return true;
      },
    });
  }) as any;
}

function createWorkspaceDelegate() {
  const workspaceRoot = () => uiStore.getSnapshot().explorerRoot;
  const ensureTrusted = () => {
    const root = workspaceRoot();
    if (root && !uiStore.getSnapshot().recentWorkspaces.includes(root)) {
      throw new Error('Workspace trust is required for extension file-system access.');
    }
  };
  return {
    fs: {
      async readFile(uri: string): Promise<Uint8Array> {
        ensureTrusted();
        return new TextEncoder().encode(await fileIpc.readText(uri));
      },
      async writeFile(uri: string, content: Uint8Array): Promise<void> {
        ensureTrusted();
        await fileIpc.save(uri, new TextDecoder().decode(content));
      },
      async readDirectory(uri: string): Promise<Array<[string, any]>> {
        ensureTrusted();
        const nodes = await fileIpc.readDirectoryFlat(uri);
        return nodes.map((node) => [node.name, node.is_dir ? 2 : 1]);
      },
      async createDirectory(uri: string): Promise<void> {
        ensureTrusted();
        await fileIpc.createDirectory(uri);
      },
      async delete(uri: string, options?: { recursive?: boolean }): Promise<void> {
        ensureTrusted();
        void options;
        await fileIpc.deleteItem(uri);
      },
      async rename(oldUri: string, newUri: string): Promise<void> {
        ensureTrusted();
        await fileIpc.renameItem(oldUri, newUri);
      },
      async stat(uri: string): Promise<{ type: any; size: number; mtime: number }> {
        ensureTrusted();
        const metadata = (await fileIpc.getFilesMetadata([uri]))[0];
        if (!metadata) throw new Error(`File not found: ${uri}`);
        return { type: metadata.is_dir ? 2 : 1, size: metadata.size, mtime: metadata.modified ?? 0 };
      },
    },
    getConfiguration: (section?: string) => {
      const prefix = section ? `${section}.` : '';
      return {
        get<T>(key: string, defaultValue?: T): T | undefined {
          const full = prefix + key;
          const store: any = settingsStore.effectiveSettings;
          if (full in store) return store[full] as T;
          if (section && key in store) return store[key] as T;
          if (key in store) return store[key] as T;
          return defaultValue as T | undefined;
        },
        has(key: string): boolean {
          const full = prefix + key;
          const store: any = settingsStore.effectiveSettings;
          return full in store || (section ? key in store : false);
        },
        async update(key: string, value: unknown): Promise<void> {
          const full = prefix + key;
          // Determine if this key belongs to known settings — use global scope by default.
          const isKnown = full in settingsStore.effectiveSettings || key in settingsStore.effectiveSettings;
          void isKnown;
          const targetKey = section ? full : key;
          settingsStore.updateSetting(targetKey as any, value);
          // The patched updateSetting already fires the emitter, but also ensure direct.
          configEmitter.fire({
            affectsConfiguration(sectionParam: string): boolean {
              return sectionParam === key || sectionParam === full || full.startsWith(sectionParam);
            },
          });
        },
      };
    },
    onDidChangeConfigurationEmitter: configEmitter,
    workspaceFolders: (() => {
      const root = uiStore.getSnapshot().explorerRoot;
      if (!root) return undefined;
      return [{ uri: root, name: root.split(/[/\\]/).pop() || root, index: 0 }];
    })(),
  };
}

function registerSdkMenu(location: string, entry: { command: string; when?: string; group?: string; alt?: string; extensionId?: string }, extensionId: string) {
  const isContextMenu = !location.startsWith('menubar/');
  const label = commandRegistry.get(entry.command)?.label
    ?? entry.command.split('.').pop()?.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    ?? entry.command;
  const when = () => {
    if (!entry.when) return true;
    const state = uiStore.getSnapshot() as any;
    return evaluateWhenClause(entry.when, {
      editorLangId: editorStore.getTabsSnapshot().find((tab: any) => tab.id === editorStore.getActiveTabIdSnapshot())?.language,
      resourceFilename: state.selectedExplorerPath,
      activeSidebarPanel: state.activeSidebarPanel,
      ...state,
    });
  };
  const id = `extension.${extensionId}.${entry.command}.${Math.random().toString(36).slice(2)}`;
  if (isContextMenu) {
    return contextMenuRegistry.register({
      id,
      contextId: location,
      label,
      command: entry.command,
      group: entry.group,
      when,
    });
  }
  return menuRegistry.register({
    id,
    menuId: location,
    label,
    command: entry.command,
    group: entry.group,
    when,
  });
}

function setupContributionDelegates(): void {
  const sdkContainers = new Map<string, {
    item: { id: string; label: string; tooltip: string; viewId: string; icon: 'explorer' | 'search' | 'git' | 'run' | 'extensions'; order: number };
    disposable: { dispose: () => void };
  }>();

  setCommandContributionDelegate({
    registerCommandContribution(contribution, extensionId) {
      const action = async (...args: unknown[]): Promise<void> => {
        await activateExtensionsForEvent(`onCommand:${contribution.command}`);
        if (!__getCommandIds().includes(contribution.command)) return undefined;
        await commands.executeCommand(contribution.command, ...args);
      };
      const disposable = commandRegistry.register({
        id: contribution.command,
        label: contribution.title,
        category: contribution.category,
        action,
      });
      void extensionId;
      return { dispose: disposable.dispose };
    },
  });

  setMenusDelegate({
    registerMenuItem(location, entry) {
      return registerSdkMenu(location, entry, entry.extensionId ?? 'unknown');
    },
    getMenuItems(location, context) {
      return menuRegistry.getForMenu(location)
        .filter((item) => !item.when || item.when())
        .map((item) => ({
          command: item.command ?? '',
          group: item.group,
          when: context ? undefined : item.when?.toString(),
        }));
    },
  });

  setViewsDelegate({
    registerViewContainer(container) {
      const icon = ['explorer', 'search', 'git', 'run', 'extensions'].includes(container.icon)
        ? container.icon as 'explorer' | 'search' | 'git' | 'run' | 'extensions'
        : 'extensions';
      const item = {
        id: container.id,
        label: container.title,
        tooltip: container.title,
        viewId: container.id,
        icon,
        order: 1000,
      };
      const disposable = activityBarRegistry.register(item);
      sdkContainers.set(container.id, { item, disposable });
      return {
        dispose: () => {
          if (sdkContainers.get(container.id)?.disposable === disposable) {
            sdkContainers.delete(container.id);
          }
          disposable.dispose();
        },
      };
    },
    registerView(view) {
      const container = sdkContainers.get(view.containerId);
      if (container && container.item.viewId === view.containerId) {
        container.disposable.dispose();
        const replacement = {
          ...container.item,
          viewId: view.id,
        };
        container.item = replacement;
        container.disposable = activityBarRegistry.register(replacement);
      }
      return sidebarRegistry.register({
        id: view.id,
        title: view.name,
        order: 1000,
        extensionViewId: view.id,
        extensionContainerId: view.containerId,
        loadComponent: () => import('../components/common/ExtensionTreeView.svelte').then((module) => module.default),
      });
    },
    getContainers: () => activityBarRegistry.getAll().map((item) => ({
      id: item.id,
      title: item.label,
      icon: item.icon,
    })),
    getViews: () => sidebarRegistry.getAll().map((view) => ({
      id: view.id,
      name: view.title,
      containerId: view.extensionContainerId ?? view.id,
    })),
  });

  setConfigurationContributionDelegate({
    registerConfiguration(configuration, extensionId) {
      const disposables = Object.entries(configuration.properties).map(([key, property]) =>
        settingsRegistry.register({
          key,
          type: property.type === 'array' || property.type === 'object' ? 'string' : property.type as 'string' | 'number' | 'boolean',
          default: property.default,
          title: key,
          description: property.description ?? `${configuration.title}: ${key}`,
          enum: property.enum?.map(String),
          category: configuration.category ?? `extension:${extensionId}`,
        }),
      );
      return {
        dispose: () => disposables.forEach((disposable) => disposable.dispose()),
      };
    },
  });
}

export function initSdkBridge(): void {
  patchSettingsStore();
  setupContributionDelegates();

  // Commands: delegate execution to core, and mirror SDK registrations into core.
  setCommandDelegate({
    async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
      await activateExtensionsForEvent(`onCommand:${id}`);
      const ok = await commandRegistry.execute(id, ...args);
      void ok;
      return undefined as T | undefined;
    },
    async getCommands(filterInternal?: boolean): Promise<string[]> {
      const ids = commandRegistry.getAll().map((c) => c.id);
      const filtered = filterInternal ? ids.filter((id) => !id.startsWith('_')) : ids;
      filtered.sort();
      return filtered;
    },
    hasCommand(id: string): boolean {
      return commandRegistry.has(id);
    },
  });

  // Mirror SDK-registered commands into core so CommandPalette sees them without dual registration.
  __setCommandMirror({
    register: (id: string, handler: any) => {
      // Derive a human label from id when the SDK registration had no label.
      const deriveLabel = (raw: string): { label: string; category?: string } => {
        const parts = raw.split('.');
        const last = parts.pop() ?? raw;
        const catRaw = parts.join(' ');
        const toTitle = (s: string) => s.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
        const label = toTitle(last);
        const category = catRaw ? toTitle(catRaw) : undefined;
        return { label, category };
      };
      const { label, category } = deriveLabel(id);
      return commandRegistry.register({ id, label, category: category as any, action: handler as any });
    },
  });

  setWorkspaceDelegate(createWorkspaceDelegate() as any);

  // Keep workspaceFolders in sync and fire SDK's workspaceFolders event.
  let lastRoot: string | null = null;
  const syncWorkspaceFolders = (root: string | null) => {
    const folders = root ? [{ uri: root, name: root.split(/[/\\]/).pop() || root, index: 0 } as any] : undefined;
    __setWorkspaceFolders(folders as any);
    setWorkspaceDelegate(createWorkspaceDelegate() as any);
  };
  const unsubUi = uiStore.subscribe((state: any) => {
    const root = state.explorerRoot as string | null;
    if (root !== lastRoot) {
      lastRoot = root;
      syncWorkspaceFolders(root);
    }
  });
  void unsubUi;
  // Initial sync.
  try { syncWorkspaceFolders(uiStore.getSnapshot().explorerRoot); } catch {}

  // Active editor -> SDK window.activeTextEditor
  let lastActiveTabId: string | null = null;
  let lastActiveTabJson = '';
  function syncActiveEditor() {
    try {
      const tabs: any[] = editorStore.getTabsSnapshot();
      const activeId: string | null = editorStore.getActiveTabIdSnapshot();
      const tab = tabs.find((t: any) => t.id === activeId) || null;
      if (!tab) {
        __setActiveTextEditor(undefined as any);
        __setVisibleTextEditors([]);
        lastActiveTabId = activeId;
        lastActiveTabJson = '';
        return;
      }
      const key = JSON.stringify([tab.id, tab.path, tab.language, tab.content?.slice(0, 80)]);
      if (activeId === lastActiveTabId && key === lastActiveTabJson) return;
      lastActiveTabId = activeId;
      lastActiveTabJson = key;
      const uri = tab.path || `untitled:${tab.name}`;
      const doc = {
        uri,
        fileName: tab.name || uri.split(/[/\\]/).pop() || uri,
        languageId: tab.language || 'plaintext',
        getText: () => tab.content ?? '',
        lineCount: (tab.content ?? '').split('\n').length,
      } as any;
      const editor = { document: doc } as any;
      __setActiveTextEditor(editor);
      __setVisibleTextEditors([editor]);
    } catch {}
  }
  let unsubTabs: (() => void) | null = null;
  let unsubActive: (() => void) | null = null;
  try {
    unsubTabs = editorStore.tabs.subscribe(() => syncActiveEditor());
    unsubActive = editorStore.activeTabId.subscribe(() => syncActiveEditor());
    syncActiveEditor();
  } catch {}

  // Theming: bridge themeStore to SDK active theme.
  const themeEmitter = new Emitter<any>();
  let lastThemeId: string | null = null;
  let lastIsDark: boolean | null = null;
  function syncActiveTheme() {
    try {
      let cur: any = null;
      const unsub = themeStore.subscribe((v: any) => (cur = v));
      unsub();
      if (!cur) return;
      if (cur.theme === lastThemeId && cur.isDark === lastIsDark) return;
      lastThemeId = cur.theme;
      lastIsDark = cur.isDark;
      __setActiveTheme({ id: cur.theme, kind: cur.isDark ? 'dark' : 'light', label: cur.theme } as any);
      themeEmitter.fire({ id: cur.theme, kind: cur.isDark ? 'dark' : 'light', label: cur.theme } as any);
    } catch {}
  }
  let unsubTheme: (() => void) | null = null;
  try {
    unsubTheme = themeStore.subscribe(() => syncActiveTheme());
    syncActiveTheme();
  } catch {}
  setThemingDelegate({
    getActiveColorTheme: () => {
      try {
        let cur: any = null;
        const unsub = themeStore.subscribe((v: any) => (cur = v));
        unsub();
        if (!cur) return { id: 'system', kind: 'dark' } as any;
        return { id: cur.theme, kind: cur.isDark ? 'dark' : 'light', label: cur.theme } as any;
      } catch {
        return { id: 'system', kind: 'dark' } as any;
      }
    },
    onDidChangeActiveColorTheme: themeEmitter.event as any,
  } as any);

  // External activity is optional and degrades to disconnected when the host
  // does not provide a native capability implementation.
  setActivityDelegate({
    init: async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<{ connected: boolean }>('init_rich_activity');
        return res;
      } catch {
        return { connected: false };
      }
    },
    setActivity: async (payload: any) => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_rich_activity', {
          details: payload.details,
          workspace: payload.workspace,
          timestamp: payload.timestamp ?? null,
          large_image: payload.large_image ?? null,
          large_text: payload.large_text ?? null,
          small_image: payload.small_image ?? null,
          small_text: payload.small_text ?? null,
        });
      } catch {}
    },
    clear: async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('clear_rich_activity');
      } catch {}
    },
  } as any);

  setWindowDelegate({
    async showInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
      notificationService.showMessage(message, 'success', items.join(', '));
      return undefined;
    },
    async showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
      notificationService.showMessage(message, 'alert', items.join(', '));
      return undefined;
    },
    async showErrorMessage(message: string, ...items: string[]): Promise<string | undefined> {
      notificationService.showError(message, items.join(', '));
      return undefined;
    },
    async showQuickPick(items: any[], options?: any): Promise<any | undefined> {
      const normalized = (items as any[]).map((it) =>
        typeof it === 'string' ? { label: it, id: it } : it
      );
      const picked = await dialogService.showQuickPick(normalized, options ?? {});
      return picked as any;
    },
    async showInputBox(options?: any): Promise<string | undefined> {
      const val = await dialogService.showInputBox(options ?? {});
      return val ?? undefined;
    },
    async withProgress<R>(options: any, task: (progress: any) => Promise<R>): Promise<R> {
      const progress = { report: () => {} };
      void options;
      return task(progress);
    },
    createStatusBarItemInternal(alignment: 'left' | 'right', priority: number, id: string): SdkStatusBarItem {
      let visible = false;
      let text = '';
      let tooltip: string | undefined;
      let command: string | undefined;
      const contribution = {
        id,
        alignment,
        priority,
        getText: () => visible ? text : null,
        getTooltip: () => tooltip,
        get command() { return command; },
      };
      const disposable = statusBarRegistry.register(contribution);
      return {
        alignment,
        priority,
        get text() { return text; },
        set text(value: string) { text = value; statusBarRegistry.refresh(); },
        get tooltip() { return tooltip; },
        set tooltip(value: string | undefined) { tooltip = value; statusBarRegistry.refresh(); },
        get command() { return command; },
        set command(value: string | undefined) { command = value; statusBarRegistry.refresh(); },
        show() { visible = true; statusBarRegistry.refresh(); },
        hide() { visible = false; statusBarRegistry.refresh(); },
        dispose() { disposable.dispose(); },
      } as SdkStatusBarItem;
    },
  });

  // Keep references to avoid GC of emitters and allow dispose to cleanup.
  (initSdkBridge as any)._disposables = { unsubTabs, unsubActive, unsubTheme };
  void themeEmitter;
}

export function disposeSdkBridge(): void {
  try {
    setCommandDelegate(null);
    setCommandContributionDelegate(null);
  } catch {}
  try {
    __setCommandMirror(null);
  } catch {}
  try {
    setWorkspaceDelegate(null);
    __setWorkspaceFolders(undefined as any);
  } catch {}
  try {
    setWindowDelegate(null);
    __setActiveTextEditor(undefined as any);
    __setVisibleTextEditors([]);
  } catch {}
  try {
    setThemingDelegate(null);
    setViewsDelegate(null);
    setMenusDelegate(null);
    setConfigurationContributionDelegate(null);
  } catch {}
  try {
    setActivityDelegate(null);
  } catch {}
  try {
    const d: any = (initSdkBridge as any)._disposables;
    if (d?.unsubTabs) d.unsubTabs();
    if (d?.unsubActive) d.unsubActive();
    if (d?.unsubTheme) d.unsubTheme();
  } catch {}
}
