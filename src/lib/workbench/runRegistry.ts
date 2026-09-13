/**
 * Run Provider Registry
 *
 * Runtime-agnostic Run abstraction. Each runtime (node, python, go, ...) is one
 * provider that turns a resolved RunConfiguration into shell statements, so
 * adding a language never edits the run service. Mirrors the editor's
 * debug-adapter provider model without coupling the UI to a single runtime.
 */

import type { RunConfiguration } from '../stores/run';
import type { ShellDialect } from '../utils/runTargets';

export interface RunProviderContext {
  /** Shell that will actually host the run. */
  shell: ShellDialect;
  workspaceFolder: string;
  activeFile: string | null;
  /** Quote + join argv for the active shell (PowerShell call-operator aware). */
  joinCommand: (parts: string[]) => string;
}

export type RunProviderResult =
  | { statements: string[]; cwd: string; label: string }
  | { unsupported: string };

export interface RunProvider {
  /** Unique provider id (e.g. node, python) */
  id: string;
  /** Human-readable label */
  label: string;
  /** RunConfiguration `type` values this provider handles */
  types: string[];
  /** Lower runs first when providers overlap */
  priority: number;
  /** Return null to let the next provider for the type handle it. */
  build: (
    resolved: RunConfiguration,
    args: string[],
    ctx: RunProviderContext
  ) => RunProviderResult | null;
}

class RunProviderRegistry {
  private providers = new Map<string, RunProvider>();

  register(provider: RunProvider): { dispose: () => void } {
    if (this.providers.has(provider.id)) {
      console.warn(`[runProviderRegistry] overwriting provider: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
    return {
      dispose: () => {
        if (this.providers.get(provider.id) === provider) this.providers.delete(provider.id);
      }
    };
  }

  registerAll(providers: RunProvider[]): { dispose: () => void } {
    const disposables = providers.map((p) => this.register(p));
    return { dispose: () => disposables.forEach((d) => d.dispose()) };
  }

  get(id: string): RunProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): RunProvider[] {
    return [...this.providers.values()].sort((a, b) => a.priority - b.priority);
  }

  /** First provider that declares the given configuration type. */
  getForType(type: string): RunProvider | undefined {
    return this.getAll().find((p) => p.types.includes(type));
  }
}

export const runProviderRegistry = new RunProviderRegistry();
