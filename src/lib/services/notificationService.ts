/**
 * Notification Service
 *
 * Central service for user notifications.
 * Wraps the toast store so callers do not depend directly on uiStore.
 */

import { uiStore } from '../stores/ui';
import { commandRegistry } from '../commands/registry';

export type NotificationType = 'success' | 'alert' | 'process';

export interface INotificationService {
  showMessage(message: string, type?: NotificationType, detail?: string): string;
  showSuccess(message: string, detail?: string): string;
  showError(message: string, detail?: string): string;
  clear(id: string): void;
}

class NotificationService implements INotificationService {
  showMessage(message: string, type: NotificationType = 'success', detail?: string): string {
    return uiStore.addToast(message, type, detail);
  }

  showSuccess(message: string, detail?: string): string {
    return uiStore.addToast(message, 'success', detail);
  }

  showError(message: string, detail?: string): string {
    return uiStore.addToast(message, 'alert', detail);
  }

  clear(id: string): void {
    uiStore.removeToast(id);
  }
}

export const notificationService: INotificationService = new NotificationService();

// Register commands so extensions can show notifications via the registry.
commandRegistry.register({
  id: 'workbench.action.showInformationMessage',
  label: 'Show Information Message',
  category: 'Notification',
  action: () => { notificationService.showMessage('Information', 'success'); }
});

commandRegistry.register({
  id: 'workbench.action.showErrorMessage',
  label: 'Show Error Message',
  category: 'Notification',
  action: () => { notificationService.showMessage('Error', 'alert'); }
});
