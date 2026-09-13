/**
 * Views
 *
 * View containers and providers with in-memory fallback.
 */
import type { Disposable, Event, TreeItem, WebviewViewProvider } from './types.js';
import { Emitter, toDisposable } from './types.js';

export interface ViewContainer {
  id: string;
  title: string;
  icon: string;
}

export interface View {
  id: string;
  name: string;
  containerId: string;
  type?: 'tree' | 'webview';
  when?: string;
  icon?: string;
}

export type ProviderResult<T> = T | Promise<T> | undefined | null;

export interface TreeDataProvider<T> {
  onDidChangeTreeData?: Event<T | undefined | void>;
  getTreeItem(element: T): TreeItem | Promise<TreeItem>;
  getChildren(element?: T): ProviderResult<T[]>;
  getParent?(element: T): ProviderResult<T | undefined>;
  resolveTreeItem?(item: TreeItem, element: T, token: unknown): ProviderResult<TreeItem>;
}

export type { TreeItem, WebviewViewProvider };

export interface ViewsDelegate {
  registerViewContainer?(container: ViewContainer): Disposable;
  registerView?(view: View): Disposable;
  registerTreeDataProviderInternal?(viewId: string, provider: TreeDataProvider<unknown>): Disposable;
  registerWebviewViewProviderInternal?(viewId: string, provider: WebviewViewProvider): Disposable;
  getContainers?(): ViewContainer[];
  getViews?(): View[];
}

let viewsDelegate: ViewsDelegate | null = null;

export function setViewsDelegate(d: ViewsDelegate | null): void {
  viewsDelegate = d;
}

export function getViewsDelegate(): ViewsDelegate | null {
  return viewsDelegate;
}

const containers = new Map<string, ViewContainer>();
const viewsMap = new Map<string, View>();
const treeProviders = new Map<string, TreeDataProvider<unknown>>();
const webviewProviders = new Map<string, WebviewViewProvider>();

const viewEmitter = new Emitter<void>();

export function __registerViewContainer(container: ViewContainer): Disposable {
  if (!container.id || !container.title || !container.icon) {
    throw new TypeError('[views] ViewContainer must have id, title, icon');
  }
  if (viewsDelegate?.registerViewContainer) {
    return viewsDelegate.registerViewContainer(container);
  }
  if (containers.has(container.id)) {
    console.warn(`[views] overwriting ViewContainer: ${container.id}`);
  }
  containers.set(container.id, { ...container });
  viewEmitter.fire();
  return toDisposable(() => {
    if (containers.get(container.id)?.title === container.title) {
      containers.delete(container.id);
      for (const [vid, v] of viewsMap) {
        if (v.containerId === container.id) viewsMap.delete(vid);
      }
      viewEmitter.fire();
    }
  });
}

export function __registerView(view: View): Disposable {
  if (!view.id || !view.name || !view.containerId) {
    throw new TypeError('[views] View must have id, name, containerId');
  }
  if (viewsDelegate?.registerView) {
    return viewsDelegate.registerView(view);
  }
  if (viewsMap.has(view.id)) {
    console.warn(`[views] overwriting View: ${view.id}`);
  }
  viewsMap.set(view.id, { ...view });
  viewEmitter.fire();
  return toDisposable(() => {
    if (viewsMap.get(view.id)?.containerId === view.containerId) {
      viewsMap.delete(view.id);
      viewEmitter.fire();
    }
  });
}

export function getContainers(): ViewContainer[] {
  if (viewsDelegate?.getContainers) return viewsDelegate.getContainers();
  return [...containers.values()];
}

export function getContainer(id: string): ViewContainer | undefined {
  if (viewsDelegate?.getContainers) return viewsDelegate.getContainers().find((c) => c.id === id);
  return containers.get(id);
}

export function getViews(containerId?: string): View[] {
  let all: View[];
  if (viewsDelegate?.getViews) all = viewsDelegate.getViews();
  else all = [...viewsMap.values()];
  if (containerId) return all.filter((v) => v.containerId === containerId);
  return all;
}

export function getView(viewId: string): View | undefined {
  if (viewsDelegate?.getViews) return viewsDelegate.getViews().find((v) => v.id === viewId);
  return viewsMap.get(viewId);
}

export function registerTreeDataProvider<T>(viewId: string, provider: TreeDataProvider<T>): Disposable {
  if (!viewId || typeof viewId !== 'string') {
    throw new TypeError('[views] registerTreeDataProvider: viewId must be non-empty string');
  }
  if (!provider || typeof provider.getChildren !== 'function' || typeof provider.getTreeItem !== 'function') {
    throw new TypeError('[views] provider must implement getChildren and getTreeItem');
  }
  if (!getView(viewId)) {
    console.warn(`[views] registerTreeDataProvider for unknown viewId "${viewId}" — provider registered anyway`);
  }
  if (viewsDelegate?.registerTreeDataProviderInternal) {
    return viewsDelegate.registerTreeDataProviderInternal(viewId, provider as TreeDataProvider<unknown>);
  }
  if (treeProviders.has(viewId)) {
    console.warn(`[views] overwriting TreeDataProvider for ${viewId}`);
  }
  treeProviders.set(viewId, provider as TreeDataProvider<unknown>);
  let sub: Disposable | undefined;
  if (provider.onDidChangeTreeData) {
    sub = provider.onDidChangeTreeData(() => viewEmitter.fire());
  }
  viewEmitter.fire();
  return toDisposable(() => {
    if (treeProviders.get(viewId) === (provider as TreeDataProvider<unknown>)) {
      treeProviders.delete(viewId);
    }
    if (sub) sub.dispose();
    viewEmitter.fire();
  });
}

export function registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable {
  if (!viewId || typeof viewId !== 'string') {
    throw new TypeError('[views] registerWebviewViewProvider: viewId must be non-empty string');
  }
  if (!provider || typeof provider.resolveWebviewView !== 'function') {
    throw new TypeError('[views] provider must implement resolveWebviewView');
  }
  if (!getView(viewId)) {
    console.warn(`[views] registerWebviewViewProvider for unknown viewId "${viewId}" — provider registered anyway`);
  }
  if (viewsDelegate?.registerWebviewViewProviderInternal) {
    return viewsDelegate.registerWebviewViewProviderInternal(viewId, provider);
  }
  if (webviewProviders.has(viewId)) {
    console.warn(`[views] overwriting WebviewViewProvider for ${viewId}`);
  }
  webviewProviders.set(viewId, provider);
  viewEmitter.fire();
  return toDisposable(() => {
    if (webviewProviders.get(viewId) === provider) webviewProviders.delete(viewId);
    viewEmitter.fire();
  });
}

export function __getViewContainers(): ViewContainer[] {
  return getContainers();
}

export function __getViews(): View[] {
  return getViews();
}

export function __getTreeDataProviders(): Map<string, TreeDataProvider<unknown>> {
  return treeProviders;
}

export function __getWebviewViewProviders(): Map<string, WebviewViewProvider> {
  return webviewProviders;
}

export function __clearViews(): void {
  containers.clear();
  viewsMap.clear();
  treeProviders.clear();
  webviewProviders.clear();
}

export const onDidChangeViews: Event<void> = viewEmitter.event;

export const views = {
  getContainer,
  getContainers,
  getView,
  getViews,
  registerTreeDataProvider,
  registerWebviewViewProvider,
  onDidChangeViews,
} as const;

export const viewsNamespace = views;
