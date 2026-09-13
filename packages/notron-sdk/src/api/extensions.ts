/**
 * Extensions
 *
 * Extension contribution types and runtime namespace.
 */
import type { ExtensionContext } from '../host/index.js';
import type { Disposable, Event } from './types.js';
import { Emitter, toDisposable } from './types.js';

export interface Extension {
  id: string;
  name: string;
  version: string;
  publisher?: string;
  description?: string;
  exports?: unknown;
  contributes?: ExtensionContributions;
  activate(ctx: ExtensionContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface ExtensionContributions {
  commands?: CommandContribution[];
  menus?: MenuContribution[];
  keybindings?: KeybindingContribution[];
}

export interface CommandContribution {
  id: string;
  title: string;
  category?: string;
}

export interface MenuContribution {
  menu: string;
  group?: string;
  command: string;
  when?: string;
}

export interface KeybindingContribution {
  key: string;
  command: string;
  when?: string;
}

export interface ExtensionInfo {
  id: string;
  version: string;
  publisher: string;
  isActive: boolean;
  exports: unknown;
  packageJSON?: unknown;
}

interface ExtensionsDelegate {
  getExtension?(extensionId: string): ExtensionInfo | undefined;
  getAll?(): ExtensionInfo[];
  onDidChange?: Event<void>;
}

let extensionsDelegate: ExtensionsDelegate | null = null;
const localExtensions = new Map<string, ExtensionInfo>();
const changeEmitter = new Emitter<void>();

export function setExtensionsDelegate(d: ExtensionsDelegate | null): void {
  extensionsDelegate = d;
}

export function getExtensionsDelegate(): ExtensionsDelegate | null {
  return extensionsDelegate;
}

export function __registerExtensionInfo(info: ExtensionInfo): Disposable {
  localExtensions.set(info.id, info);
  changeEmitter.fire();
  return toDisposable(() => {
    if (localExtensions.get(info.id) === info) {
      localExtensions.delete(info.id);
      changeEmitter.fire();
    }
  });
}

export function getExtension(extensionId: string): ExtensionInfo | undefined {
  if (extensionsDelegate?.getExtension) return extensionsDelegate.getExtension(extensionId);
  return localExtensions.get(extensionId);
}

export function getAllExtensions(): ExtensionInfo[] {
  if (extensionsDelegate?.getAll) return extensionsDelegate.getAll();
  return [...localExtensions.values()];
}

export const onDidChange: Event<void> = (listener, thisArg, disposables) => {
  if (extensionsDelegate?.onDidChange) return extensionsDelegate.onDidChange(listener as (e: void) => unknown, thisArg, disposables);
  return changeEmitter.event(listener as (e: void) => unknown, thisArg, disposables);
};

export function __clearExtensions(): void {
  localExtensions.clear();
}

export const extensions = {
  getExtension,
  get all(): ExtensionInfo[] {
    return getAllExtensions();
  },
  onDidChange,
} as const;

export const extensionsNamespace = extensions;
