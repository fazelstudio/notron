/**
 * Sidebar Registry
 *
 * Central store for sidebar views.
 * Features register their views here and the shell renders the
 * active one without hardcoding view names.
 */

export interface SidebarView {
  /** Unique view ID (e.g. explorer, search, git, run) */
  id: string;
  /** Optional SDK view id rendered by the generic extension view host. */
  extensionViewId?: string;
  /** Owning SDK view container, when contributed by an extension. */
  extensionContainerId?: string;
  /** Human-readable title shown in sidebar header */
  title: string;
  /** Lazy loader for the Svelte component */
  loadComponent: () => Promise<any>;
  /** When false the view is hidden */
  when?: () => boolean;
  order: number;
  /** Optional icon override (falls back to activity bar icon) */
  icon?: string;
}

class SidebarRegistry {
  private views = new Map<string, SidebarView>();
  private listeners = new Set<() => void>();

  register(view: SidebarView): { dispose: () => void } {
    if (this.views.has(view.id)) {
      console.warn(`[sidebarRegistry] overwriting view: ${view.id}`);
    }
    this.views.set(view.id, view);
    this.notify();
    return {
      dispose: () => {
        if (this.views.get(view.id) === view) {
          this.views.delete(view.id);
          this.notify();
        }
      },
    };
  }

  registerAll(views: SidebarView[]): { dispose: () => void } {
    const disposables = views.map((v) => this.register(v));
    return { dispose: () => disposables.forEach((d) => d.dispose()) };
  }

  get(id: string): SidebarView | undefined {
    return this.views.get(id);
  }

  getAll(): SidebarView[] {
    return [...this.views.values()].sort((a, b) => a.order - b.order);
  }

  getVisible(): SidebarView[] {
    return this.getAll().filter((v) => !v.when || v.when());
  }

  onDidChange(listener: () => void): { dispose: () => void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}

export const sidebarRegistry = new SidebarRegistry();
