/**
 * Bottom Panel Registry
 *
 * Central store for bottom panel tabs.
 * Features register their panels here and the shell renders them
 * without hardcoding panel names.
 */

export type BottomPanelComponent = any;

export interface BottomPanelItem {
  /** Unique panel ID (e.g. terminal, output, problems) */
  id: string;
  /** Human-readable title shown in the panel tab bar */
  label: string;
  /** Optional badge text (e.g. problems count) */
  badge?: () => string | null;
  /** Lazy loader for the Svelte component — when omitted panel renders inline */
  loadComponent?: () => Promise<BottomPanelComponent>;
  /** When false the panel is hidden */
  when?: () => boolean;
  order: number;
}

class BottomPanelRegistry {
  private items: BottomPanelItem[] = [];
  private listeners = new Set<() => void>();

  register(item: BottomPanelItem): { dispose: () => void } {
    if (this.items.some((i) => i.id === item.id)) {
      console.warn(`[bottomPanelRegistry] overwriting panel: ${item.id}`);
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

  registerAll(items: BottomPanelItem[]): { dispose: () => void } {
    const disposables = items.map((i) => this.register(i));
    return { dispose: () => disposables.forEach((d) => d.dispose()) };
  }

  getAll(): BottomPanelItem[] {
    return [...this.items].sort((a, b) => a.order - b.order);
  }

  getVisible(): BottomPanelItem[] {
    return this.getAll().filter((i) => !i.when || i.when());
  }

  get(id: string): BottomPanelItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  onDidChange(listener: () => void): { dispose: () => void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}

export const bottomPanelRegistry = new BottomPanelRegistry();
