/**
 * SCM Provider Registry
 *
 * Generic Source Control abstraction. The panel UI is generic and is filled
 * by SCM Providers — Git is one provider, not the only one architecturally.
 * Mirrors VS Code's `scm` contribution point.
 */

export interface ScmProvider {
  /** Unique provider ID (e.g. git) */
  id: string;
  /** Human-readable label (e.g. Git) */
  label: string;
  /** Icon id for the provider */
  icon?: string;
  /** Badge text for activity bar (e.g. change count) */
  getBadgeText?: () => string | null;
  /** When false provider is hidden */
  when?: () => boolean;
  /** Priority — lower renders first */
  priority: number;
  /** Lazy loader for the provider's view component */
  loadComponent: () => Promise<any>;
}

class ScmRegistry {
  private providers = new Map<string, ScmProvider>();
  private listeners = new Set<() => void>();

  register(provider: ScmProvider): { dispose: () => void } {
    if (this.providers.has(provider.id)) {
      console.warn(`[scmRegistry] overwriting provider: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
    this.notify();
    return {
      dispose: () => {
        if (this.providers.get(provider.id) === provider) {
          this.providers.delete(provider.id);
          this.notify();
        }
      }
    };
  }

  get(id: string): ScmProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): ScmProvider[] {
    return [...this.providers.values()].sort((a, b) => a.priority - b.priority);
  }

  getVisible(): ScmProvider[] {
    return this.getAll().filter((p) => !p.when || p.when());
  }

  onDidChange(listener: () => void): { dispose: () => void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}

export const scmRegistry = new ScmRegistry();

// Default Git provider — delegates to the existing SourceControlPanel.
// The heavy Git UI stays in SourceControlPanel.svelte; this registration.
// Makes the SCM panel generic so future providers can be added without.
// Touching the shell.
scmRegistry.register({
  id: 'git',
  label: 'Git',
  priority: 10,
  loadComponent: () => import('../components/panels/SourceControlPanel.svelte').then((m) => m.default)
});
