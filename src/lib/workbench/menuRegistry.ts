/**
 * Menu Registry
 *
 * Central store for menu items.
 * Features register their menu entries here and the shell renders them
 * for the target location without hardcoding. Menu locations are separate
 * containers, e.g. `menubar/file`, `view/explorer/title`, `panel/terminal/title`,
 * `editor/context`, `tab/context`.
 */

import { commandRegistry } from '../commands/registry';

export interface MenuItem {
  /** Unique ID for the menu item */
  id: string;
  /** Menu location: "menubar/file", "menubar/edit", "explorer/context", "editor/context", etc. */
  menuId: string;
  label: string;
  command?: string;
  group?: string;
  order?: number;
  shortcut?: string;
  when?: () => boolean;
  checked?: () => boolean;
  disabled?: () => boolean;
  separator?: boolean;
  submenu?: MenuItem[];
  /** Direct action fallback when no command is registered (for migration) */
  action?: () => void;
}

/** Renderer-ready menu item produced by `getMenuItems`. */
export interface ResolvedMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  separator?: boolean;
  action: () => void;
}

class MenuRegistry {
  private items: MenuItem[] = [];
  private listeners = new Set<() => void>();

  register(item: MenuItem): { dispose: () => void } {
    this.items.push(item);
    this.notify();
    return {
      dispose: () => {
        this.items = this.items.filter((i) => i !== item);
        this.notify();
      },
    };
  }

  registerAll(items: MenuItem[]): { dispose: () => void } {
    const disposables = items.map((i) => this.register(i));
    return { dispose: () => disposables.forEach((d) => d.dispose()) };
  }

  /** Get sorted items for a menu, ordered by group then order. */
  getForMenu(menuId: string): MenuItem[] {
    return this.items
      .filter((i) => i.menuId === menuId && (!i.when || i.when()))
      .sort((a, b) => {
        const g = (a.group ?? '').localeCompare(b.group ?? '');
        if (g !== 0) return g;
        return (a.order ?? 0) - (b.order ?? 0);
      });
  }

  /** Group menubar items by top-level label. */
  getMenubarMenus(): Map<string, MenuItem[]> {
    const result = new Map<string, MenuItem[]>();
    const menubarItems = this.items.filter((i) => i.menuId.startsWith('menubar/'));
    for (const item of menubarItems) {
      const label = item.menuId.replace('menubar/', '');
      // Capitalize first letter for display (file -> File)
      const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
      if (!result.has(displayLabel)) result.set(displayLabel, []);
      if (!item.when || item.when()) {
        const arr = result.get(displayLabel)!;
        const existingIdx = arr.findIndex(i => i.label === item.label);
        if (existingIdx !== -1) {
          // Merge properties, preferring the new one, but keep the action if available.
          arr[existingIdx] = { ...arr[existingIdx], ...item, action: item.action || arr[existingIdx].action };
        } else {
          arr.push(item);
        }
      }
    }
    // Sort within each menu.
    for (const [, v] of result) {
      v.sort((a, b) => {
        const g = (a.group ?? '').localeCompare(b.group ?? '');
        if (g !== 0) return g;
        return (a.order ?? 0) - (b.order ?? 0);
      });
    }
    return result;
  }

  getAll(): MenuItem[] {
    return [...this.items];
  }

  /** True when at least one visible item is registered for a menu location. */
  hasMenu(menuId: string): boolean {
    return this.getForMenu(menuId).length > 0;
  }

  /**
   * Resolve a menu into renderer-ready items. A separator is inserted when
   * the group changes so contributions only declare group + order.
   */
  getMenuItems(menuId: string): ResolvedMenuItem[] {
    const resolved: ResolvedMenuItem[] = [];
    let lastGroup: string | undefined;
    for (const item of this.getForMenu(menuId)) {
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
        checked: item.checked ? item.checked() : false,
        disabled: item.disabled ? item.disabled() : false,
        action: () => {
          if (item.command && commandRegistry.has(item.command)) {
            void commandRegistry.execute(item.command);
            return;
          }
          if (item.action) item.action();
        }
      });
    }
    return resolved;
  }

  onDidChange(listener: () => void): { dispose: () => void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}

export const menuRegistry = new MenuRegistry();
