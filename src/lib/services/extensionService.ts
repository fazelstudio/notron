/**
 * Extension Service
 *
 * Discovers installed packages and adapts their bundled CommonJS entry points to the SDK host.
 */

import { dialogService } from './dialogService';
import { notificationService } from './notificationService';
import { extensionIpc } from '../platform/ipc';
import type { ExtensionHost, ExtensionModule } from 'notron-sdk';
import type { ExtensionManifest } from 'notron-sdk';

interface InstalledExtension {
  id: string;
  manifest: ExtensionManifest;
  path: string;
  source: string;
}

let host: ExtensionHost | null = null;
const loadedExtensions = new Map<string, InstalledExtension>();
let activeWorkspace: string | undefined;

export function setExtensionHost(extensionHost: ExtensionHost): void {
  host = extensionHost;
}

function loadCommonJsModule(source: string, extensionId: string): ExtensionModule {
  const module = { exports: {} as Record<string, unknown> };
  const restrictedRequire = (request: string): unknown => {
    if (request !== 'notron-sdk') {
      throw new Error(`Extension "${extensionId}" attempted to import "${request}". Only notron-sdk is available.`);
    }
    return importSdkNamespace();
  };
  const execute = new Function('require', 'module', 'exports', `${source}\n//# sourceURL=notron-extension:${extensionId}`);
  execute(restrictedRequire, module, module.exports);
  const value = (module.exports as any).default ?? module.exports;
  if (!value || typeof value.activate !== 'function') {
    throw new Error(`Extension "${extensionId}" does not export activate(context).`);
  }
  return value as ExtensionModule;
}

// Kept in a function so extensions never receive a core registry or store.
function importSdkNamespace(): Record<string, unknown> {
  // This module is already bundled by the application; require() needs a synchronous value.
  return sdkNamespace;
}

import * as sdkNamespace from 'notron-sdk';

async function discover(workspace?: string): Promise<void> {
  if (!host) return;
  if (workspace !== undefined) activeWorkspace = workspace || undefined;
  const effectiveWorkspace = workspace ?? activeWorkspace;
  const result = await extensionIpc.list(effectiveWorkspace);
  for (const error of result.errors ?? []) {
    notificationService.showError(`Extension discovery failed`, error);
  }
  const manifests: ExtensionManifest[] = [];
  const modules = new Map<string, ExtensionModule>();
  const paths = new Map<string, string>();
  const discovered = new Map(result.extensions.map((extension) => [extension.id, extension as InstalledExtension]));

  for (const [id, loaded] of loadedExtensions) {
    if (loaded.source === 'workspace' && (!effectiveWorkspace || discovered.get(id)?.path !== loaded.path)) {
      await host.removeExtension(id);
      loadedExtensions.delete(id);
    }
  }

  for (const installed of result.extensions as InstalledExtension[]) {
    const loaded = loadedExtensions.get(installed.id);
    if (loaded?.path === installed.path) continue;
    if (loaded) {
      await host.removeExtension(installed.id);
      loadedExtensions.delete(installed.id);
    }
    try {
      const main = installed.manifest.main;
      const source = await extensionIpc.readModule(installed.path, main, effectiveWorkspace);
      const extensionModule = loadCommonJsModule(source, installed.id);
      manifests.push(installed.manifest);
      modules.set(installed.id, extensionModule);
      paths.set(installed.id, installed.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notificationService.showError(`Unable to load extension "${installed.id}"`, message);
    }
  }
  if (manifests.length > 0) {
    host.register(manifests, modules, paths);
    manifests.forEach((manifest) => {
      const installed = discovered.get(manifest.id);
      if (installed) loadedExtensions.set(manifest.id, installed);
    });
    await host.activateAll();
  }
  await host.activateAll();
  await host.activateByEvent('workspaceContains:*');
}

export async function discoverInstalledExtensions(workspace?: string): Promise<void> {
  try {
    await discover(workspace);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notificationService.showError('Unable to discover installed extensions', message);
  }
}

export async function installExtensionFromPalette(): Promise<void> {
  const selected = await dialogService.showOpenDialog({
    filters: [{ name: 'Notron Extension', extensions: ['ntrn'] }],
  });
  const packagePath = selected?.[0];
  if (!packagePath) return;
  try {
    const installed = await extensionIpc.install(packagePath);
    notificationService.showSuccess(`Installed ${installed.manifest.displayName ?? installed.id}`);
    await discoverInstalledExtensions(activeWorkspace);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notificationService.showError('Extension installation failed', message);
  }
}

export async function uninstallExtension(id: string): Promise<void> {
  try {
    await host?.removeExtension(id);
    await extensionIpc.uninstall(id);
    loadedExtensions.delete(id);
    notificationService.showSuccess(`Uninstalled ${id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notificationService.showError('Extension uninstall failed', message);
  }
}

export async function uninstallExtensionFromPalette(): Promise<void> {
  try {
    const result = await extensionIpc.list(activeWorkspace);
    const global = result.extensions.filter((extension) => extension.source === 'global');
    if (global.length === 0) {
      notificationService.showMessage('No globally installed extensions found.', 'alert');
      return;
    }
    const selected = await dialogService.showQuickPick(global.map((extension) => ({
      id: extension.id,
      label: extension.manifest.displayName ?? extension.id,
      description: extension.manifest.version,
    })), { placeHolder: 'Select an extension to uninstall' });
    const pickedId = Array.isArray(selected) ? selected[0]?.id : selected?.id;
    if (pickedId) await uninstallExtension(pickedId);
    await discoverInstalledExtensions(activeWorkspace);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notificationService.showError('Unable to list installed extensions', message);
  }
}

export async function activateExtensionsForEvent(event: string): Promise<void> {
  await host?.activateByEvent(event);
}

export async function deactivateExtensions(): Promise<void> {
  await host?.deactivateAll();
}
