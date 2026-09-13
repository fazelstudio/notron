/**
 * Command Registry
 *
 * Central store for commands. Each action is registered with a unique id
 * and invoked by that id from menus, palette, or keybindings.
 */

/**
 * Command capability level.
 *
 * `safe`      — no side effects outside the app (never gated).
 * `trusted`   — touches the filesystem or a shell in the workspace.
 * `dangerous` — runs outside the workspace / network side effects.
 *
 * Levels are metadata so a trust check can be inserted in front of sensitive
 * commands later without auditing every handler.
 */
export type CommandCapability = 'safe' | 'trusted' | 'dangerous';

export interface Command {
  /** Unique ID, e.g. `workbench.action.newFile` */
  id: string;
  /** Human-readable label shown in palette/menu */
  label: string;
  /** Category for grouping in palette (e.g. File, View) */
  category?: string;
  /** Default keybinding hint (display only; actual binding lives in keybindingRegistry) */
  shortcut?: string;
  /** Keywords for fuzzy search */
  keywords?: string[];
  /** Action executed when command invoked — may receive args from execute() */
  action: (...args: any[]) => void | Promise<void>;
  /** Optional precondition — command hidden/disabled when false */
  when?: () => boolean;
  /** Security level; sensitive commands can be gated behind workspace trust. */
  capability?: CommandCapability;
}

type Listener = (cmd: Command) => void;

/**
 * Optional trust gate. When set, commands whose capability is `trusted` or
 * `dangerous` are blocked while the gate returns false. Unset by default, so
 * registering the gate is a one-line change once workspace trust is wired.
 */
let trustGate: (() => boolean) | null = null;

class CommandRegistry {
  private commands = new Map<string, Command>();
  private listeners = new Set<Listener>();

  register(cmd: Command): { dispose: () => void } {
    if (this.commands.has(cmd.id)) {
      console.warn(`[commandRegistry] overwriting command: ${cmd.id}`);
    }
    this.commands.set(cmd.id, cmd);
    for (const l of this.listeners) l(cmd);
    return {
      dispose: () => {
        if (this.commands.get(cmd.id) === cmd) this.commands.delete(cmd.id);
      }
    };
  }

  registerAll(cmds: Command[]): { dispose: () => void } {
    const disposables = cmds.map((c) => this.register(c));
    return {
      dispose: () => disposables.forEach((d) => d.dispose())
    };
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  has(id: string): boolean {
    return this.commands.has(id);
  }

  /** Attach a capability level to an already-registered command. */
  markCapability(id: string, capability: CommandCapability): void {
    const cmd = this.commands.get(id);
    if (cmd) cmd.capability = capability;
  }

  /** Commands at or above a capability level (for auditing/UI). */
  getByCapability(capability: CommandCapability): Command[] {
    return this.getAll().filter((c) => c.capability === capability);
  }

  /** Install the trust gate consulted before sensitive commands run. */
  setTrustGate(gate: (() => boolean) | null): void {
    trustGate = gate;
  }

  /** True when the command is allowed to run under the current trust state. */
  isAllowed(cmd: Command): boolean {
    if (!cmd.capability || cmd.capability === 'safe') return true;
    return trustGate ? trustGate() : true;
  }

  getAll(): Command[] {
    return [...this.commands.values()];
  }

  /** Execute by id. Returns true when the command was found and run. */
  async execute(id: string, ...args: any[]): Promise<boolean> {
    const cmd = this.commands.get(id);
    if (!cmd) {
      console.warn(`[commandRegistry] unknown command: ${id}`);
      return false;
    }
    if (cmd.when && !cmd.when()) return false;
    if (!this.isAllowed(cmd)) {
      console.warn(`[commandRegistry] blocked by trust gate: ${id}`);
      return false;
    }
    await cmd.action(...args);
    return true;
  }

  /** Alias matching the spec name `executeCommand`. */
  async executeCommand(id: string, ...args: any[]): Promise<boolean> {
    return this.execute(id, ...args);
  }

  onDidRegister(listener: Listener): { dispose: () => void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }
}

export const commandRegistry = new CommandRegistry();

/** Convert all registered commands to palette items. */
export function toPaletteItems(
  registry: CommandRegistry = commandRegistry
): Array<{ id: string; label: string; category: string; shortcut?: string; keywords?: string[]; action: () => void }> {
  return registry.getAll().map((c) => ({
    id: c.id,
    label: c.label,
    category: (c.category as any) ?? 'command',
    shortcut: c.shortcut,
    keywords: c.keywords,
    action: () => void c.action()
  }));
}

/** Global helper so UI can call `executeCommand(id)` without importing registry. */
export function executeCommand(id: string, ...args: any[]): Promise<boolean> {
  return commandRegistry.execute(id, ...args);
}
