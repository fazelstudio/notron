/**
 * Dialog Service — Common Capabilities
 *
 * Generic service for cross-cutting UI capabilities: notifications/toast,
 * quickPick (command-palette style picker), inputBox, file picker, progress.
 * Commands call this service instead of each feature building its own dialog.
 */

import { dialogStore, type QuickPickItem } from '../stores/dialog';
import { notificationService } from './notificationService';
import { uiStore } from '../stores/ui';
import { eventBus } from '../utils/eventBus';
import { commandRegistry } from '../commands/registry';

export type { QuickPickItem } from '../stores/dialog';

export interface QuickPickOptions {
  placeHolder?: string;
  canPickMany?: boolean;
}

export interface InputBoxOptions {
  prompt?: string;
  placeHolder?: string;
  value?: string;
  password?: boolean;
  validateInput?: (value: string) => string | null | undefined;
}

class DialogService {
  /** Show a quick pick (fuzzy search list). Resolves with selected item(s) or undefined when cancelled. */
  showQuickPick(
    items: QuickPickItem[],
    options?: QuickPickOptions
  ): Promise<QuickPickItem | QuickPickItem[] | undefined> {
    return dialogStore.showQuickPick(items, options);
  }

  /** Show an input box. Resolves with the entered value or undefined when cancelled. */
  showInputBox(options?: InputBoxOptions): Promise<string | undefined> {
    return dialogStore.showInputBox(options);
  }

  /** Show file picker via Tauri dialog (wrapped). */
  async showOpenDialog(options?: { canSelectMany?: boolean; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string[] | undefined> {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ multiple: options?.canSelectMany ?? false, filters: options?.filters });
      if (!selected) return undefined;
      return Array.isArray(selected) ? selected as string[] : [selected as string];
    } catch {
      return undefined;
    }
  }

  /** Progress indicator — shows one persistent process toast for the duration. */
  async withProgress<T>(
    options: { title: string; cancellable?: boolean },
    task: (progress: { report: (p: { message?: string; increment?: number }) => void }) => Promise<T>
  ): Promise<T> {
    let latestMessage: string | undefined;
    uiStore.addProcessToast(options.title, latestMessage);
    try {
      return await task({
        report: (p) => {
          latestMessage = p.message;
          if (p.message) uiStore.addProcessToast(options.title, p.message);
        }
      });
    } finally {
      uiStore.removeProcessToast();
    }
  }

  /** Notification passthroughs — single service for toasts. */
  info(message: string): void {
    notificationService.showMessage(message, 'success');
  }
  warn(message: string): void {
    notificationService.showMessage(message, 'alert');
  }
  error(message: string): void {
    notificationService.showError(message);
  }
}

export const dialogService = new DialogService();

// A real consumer of the quick pick capability: pick a recent workspace.
// Registered here so the capability has a working command entry point.
commandRegistry.register({
  id: 'workbench.action.openRecentWorkspace',
  label: 'File: Open Recent Workspace...',
  category: 'File',
  keywords: ['recent', 'workspace', 'folder', 'open'],
  action: async () => {
    const recent = uiStore.getSnapshot().recentWorkspaces;
    if (recent.length === 0) {
      notificationService.showMessage('No recent workspaces', 'alert');
      return;
    }
    const picked = await dialogService.showQuickPick(
      recent.map((path) => ({
        id: path,
        label: path.split(/[/\\]/).pop() || path,
        description: path
      })),
      { placeHolder: 'Select a workspace to open' }
    );
    if (picked && !Array.isArray(picked) && picked.id) {
      eventBus.emit('request-workspace-switch', { path: picked.id });
    }
  }
});
