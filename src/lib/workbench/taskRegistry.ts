/**
 * Task Provider Registry
 *
 * Registry for task providers that supply build and test tasks for the workspace.
 */

export interface TaskDefinition {
  /** Unique task ID */
  id: string;
  /** Display label */
  label: string;
  /** Task group: build | test | none */
  group?: 'build' | 'test' | 'none';
  /** Command line to execute */
  command: string;
  /** Args */
  args?: string[];
  /** Working directory */
  cwd?: string;
}

export interface TaskProvider {
  /** Unique provider ID (e.g. npm, cargo) */
  id: string;
  /** Human-readable label */
  label: string;
  /** Provide tasks for current workspace */
  provideTasks: (workspaceRoot: string) => Promise<TaskDefinition[]> | TaskDefinition[];
  /** Resolve a task before execution (optional) */
  resolveTask?: (task: TaskDefinition) => Promise<TaskDefinition> | TaskDefinition;
  priority: number;
  when?: () => boolean;
}

class TaskRegistry {
  private providers = new Map<string, TaskProvider>();
  private listeners = new Set<() => void>();

  register(provider: TaskProvider): { dispose: () => void } {
    if (this.providers.has(provider.id)) {
      console.warn(`[taskRegistry] overwriting provider: ${provider.id}`);
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

  get(id: string): TaskProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): TaskProvider[] {
    return [...this.providers.values()].sort((a, b) => a.priority - b.priority);
  }

  getVisible(): TaskProvider[] {
    return this.getAll().filter((p) => !p.when || p.when());
  }

  async provideAll(workspaceRoot: string): Promise<TaskDefinition[]> {
    const all: TaskDefinition[] = [];
    for (const p of this.getVisible()) {
      try {
        const tasks = await p.provideTasks(workspaceRoot);
        all.push(...tasks);
      } catch (e) {
        console.warn(`[taskRegistry] provider ${p.id} failed:`, e);
      }
    }
    return all;
  }

  onDidChange(listener: () => void): { dispose: () => void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}

export const taskRegistry = new TaskRegistry();

// Default shell provider — allows running arbitrary shell commands without.
// Hardcoding a single run target. Future providers (npm, cargo, etc.) register.
// Separately.
taskRegistry.register({
  id: 'shell',
  label: 'Shell',
  priority: 100,
  provideTasks: () => []
});
