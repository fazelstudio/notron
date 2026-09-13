/**
 * Context Menu Registry
 *
 * Central store for context menu items.
 * Features register their entries by context id and the UI renders them
 * without hardcoding. Items are data (command id + when/disabled predicates),
 * never inline handlers in the component markup.
 */

import { commandRegistry } from '../commands/registry';

export interface ContextMenuItem {
  /** Unique id within the context menu */
  id: string;
  /** Context ID, e.g. `explorer/context`, `editor/context`, `tab/context` */
  contextId: string;
  label: string;
  /** Command id executed on select. Preferred over `onSelect`. */
  command?: string;
  /** Group name; a separator is inserted automatically between groups */
  group?: string;
  order?: number;
  when?: () => boolean;
  /** Disabled predicate evaluated when the menu is built */
  disabled?: () => boolean;
  separator?: boolean;
  shortcut?: string;
  /** Fallback action used when the item has no command */
  onSelect?: () => void | Promise<void>;
}

/** Menu-item shape consumed by the shared ContextMenu.svelte renderer. */
export interface ResolvedContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  action: () => void;
}

class ContextMenuRegistry {
  private items: ContextMenuItem[] = [];

  register(item: ContextMenuItem): { dispose: () => void } {
    this.items.push(item);
    return {
      dispose: () => {
        this.items = this.items.filter((i) => i !== item);
      }
    };
  }

  registerAll(items: ContextMenuItem[]): { dispose: () => void } {
    const disposables = items.map((i) => this.register(i));
    return { dispose: () => disposables.forEach((d) => d.dispose()) };
  }

  getForContext(contextId: string): ContextMenuItem[] {
    return this.items
      .filter((i) => i.contextId === contextId && (!i.when || i.when()))
      .sort((a, b) => {
        const g = (a.group ?? '').localeCompare(b.group ?? '');
        if (g !== 0) return g;
        return (a.order ?? 0) - (b.order ?? 0);
      });
  }

  getAll(): ContextMenuItem[] {
    return [...this.items];
  }

  /**
   * Resolve a context menu into renderer-ready items.
   * A separator is inserted whenever the group changes, mirroring the
   * editor's group-based menu model, so contributions never hand-place
   * separators or depend on registration order.
   */
  getMenuItems(contextId: string): ResolvedContextMenuItem[] {
    const resolved: ResolvedContextMenuItem[] = [];
    let lastGroup: string | undefined;
    for (const item of this.getForContext(contextId)) {
      if (item.separator) {
        resolved.push({ id: item.id, label: '', separator: true, action: () => {} });
        continue;
      }
      if (lastGroup !== undefined && item.group !== lastGroup) {
        resolved.push({ id: `${item.id}-separator`, label: '', separator: true, action: () => {} });
      }
      lastGroup = item.group;
      resolved.push({
        id: item.id,
        label: item.label,
        shortcut: item.shortcut,
        disabled: item.disabled ? item.disabled() : false,
        action: () => {
          if (item.command && commandRegistry.has(item.command)) {
            void commandRegistry.execute(item.command);
            return;
          }
          if (item.onSelect) void item.onSelect();
        }
      });
    }
    return resolved;
  }
}

export const contextMenuRegistry = new ContextMenuRegistry();