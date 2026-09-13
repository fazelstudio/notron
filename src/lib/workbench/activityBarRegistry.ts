/**
 * Activity Bar Registry
 *
 * Central store for activity bar items.
 * Features register their items here and the shell renders them
 * without needing to change its markup.
 */

export type ActivityBarIcon = 'explorer' | 'search' | 'git' | 'run' | 'extensions';

export interface ActivityBarItem {
  /** Unique ID — also the viewContainer ID (e.g. explorer, search) */
  id: string;
  /** Human-readable label */
  label: string;
  /** Tooltip shown on hover */
  tooltip: string;
  /** Keyboard shortcut hint (display only; actual binding in keybindings.ts) */
  shortcut?: string;
  /** Sidebar view ID this item activates */
  viewId: string;
  order: number;
  /** Icon identifier — rendered by ActivityBar.svelte */
  icon: ActivityBarIcon;
  /** When false the item is hidden */
  when?: () => boolean;
  /** Optional badge text (e.g. git change count) */
  getBadgeText?: () => string | null;
  /** When true shows a loading spinner instead of badge */
  getBadgeLoading?: () => boolean;
}

class ActivityBarRegistry {
  private items: ActivityBarItem[] = [];
  private listeners = new Set<() => void>();

  register(item: ActivityBarItem): { dispose: () => void } {
    if (this.items.some((i) => i.id === item.id)) {
      console.warn(`[activityBarRegistry] overwriting activity bar item: ${item.id}`);
      this.items = this.items.filter((i) => i.id !== item.id);
    }
    this.items.push(item);
    this.items.sort((a, b) => a.order - b.order);
    this.notify();
    return {
      dispose: () => {
        this.items = this.items.filter((i) => i.id !== item.id);
        this.notify();
      },
    };
  }

  registerAll(items: ActivityBarItem[]): { dispose: () => void } {
    const disposables = items.map((i) => this.register(i));
    return { dispose: () => disposables.forEach((d) => d.dispose()) };
  }

  getAll(): ActivityBarItem[] {
    return [...this.items].sort((a, b) => a.order - b.order);
  }

  getVisible(): ActivityBarItem[] {
    return this.getAll().filter((i) => !i.when || i.when());
  }

  onDidChange(listener: () => void): { dispose: () => void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}

export const activityBarRegistry = new ActivityBarRegistry();
