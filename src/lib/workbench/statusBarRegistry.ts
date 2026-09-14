/**
 * Status Bar Registry
 *
 * Central store for status bar items.
 * The bar renders from registered items, ordered by priority.
 */

import type { StatusBarAlignment } from '../sdk/types';

export interface StatusBarContribution {
  id: string;
  alignment: StatusBarAlignment;
  priority: number;
  /** Text may be static or derived via getter */
  getText: () => string | null;
  getTooltip?: () => string | undefined;
  command?: string;
  when?: () => boolean;
}

class StatusBarRegistry {
  private items: StatusBarContribution[] = [];
  private listeners = new Set<() => void>();

  register(item: StatusBarContribution): { dispose: () => void } {
    this.items.push(item);
    this.items.sort((a, b) => b.priority - a.priority);
    this.notify();
    return {
      dispose: () => {
        this.items = this.items.filter((i) => i !== item);
        this.notify();
      }
    };
  }

  getAll(): StatusBarContribution[] {
    return [...this.items];
  }

  getByAlignment(alignment: StatusBarAlignment): StatusBarContribution[] {
    return this.items.filter((i) => i.alignment === alignment).sort((a, b) => b.priority - a.priority);
  }

  onDidChange(listener: () => void): { dispose: () => void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  refresh(): void {
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const statusBarRegistry = new StatusBarRegistry();