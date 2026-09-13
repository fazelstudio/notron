/**
 * Workbench Contributions
 *
 * Default definitions for activity bar, sidebar, bottom panel, and menus.
 * Each list is the single source for its area. The shell renders from
 * these lists so a new view can be added with one entry.
 */

import { activityBarRegistry } from './activityBarRegistry';
import type { ActivityBarItem } from './activityBarRegistry';
import { sidebarRegistry } from './sidebarRegistry';
import type { SidebarView } from './sidebarRegistry';
import { bottomPanelRegistry } from './bottomPanelRegistry';
import { menuRegistry } from './menuRegistry';
import { gitRepoStore } from '../stores/gitRepo';

// Re-export for backwards compatibility
export type { ActivityBarItem, ActivityBarIcon } from './activityBarRegistry';
export type { SidebarView } from './sidebarRegistry';

export interface BottomPanelItem {
  /** Unique panel ID (e.g. terminal, output, problems) */
  id: string;
  /** Human-readable title shown in the panel tab bar */
  label: string;
  /** Optional badge text (e.g. problems count) */
  badge?: () => string | null;
  /** Lazy loader for the Svelte component — when omitted panel renders inline in BottomPanel.svelte */
  loadComponent?: () => Promise<any>;
  /** When false the panel is hidden */
  when?: () => boolean;
  order: number;
}

export interface MenuItemContribution {
  label: string;
  command?: string;
  shortcut?: string;
  separator?: boolean;
  /** Checked state predicate (for toggle items) */
  checked?: () => boolean;
  /** Disabled predicate */
  disabled?: () => boolean;
  /** Submenu items */
  submenu?: MenuItemContribution[];
}

export interface MenuBarContribution {
  label: string;
  items: MenuItemContribution[];
}

export interface StatusBarItem {
  id: string;
  alignment: 'left' | 'right';
  priority: number;
  /** Text or derived text */
  text?: string;
  tooltip?: string;
  command?: string;
  when?: () => boolean;
}

// Activity Bar — single source of truth

export const ACTIVITY_BAR_ITEMS: ActivityBarItem[] = [
  { id: 'explorer', label: 'Explorer', tooltip: 'Explorer (Ctrl+Shift+E)', shortcut: 'Ctrl+Shift+E', viewId: 'explorer', order: 1, icon: 'explorer' },
  { id: 'search', label: 'Search', tooltip: 'Search (Ctrl+Shift+F)', shortcut: 'Ctrl+Shift+F', viewId: 'search', order: 2, icon: 'search' },
  {
    id: 'git',
    label: 'Source Control',
    tooltip: 'Source Control (Ctrl+Shift+G)',
    shortcut: 'Ctrl+Shift+G',
    viewId: 'git',
    order: 3,
    icon: 'git',
    // Badge shows staged + unstaged + conflicted count; hidden while loading.
    getBadgeText: () => {
      let repo: any = null;
      let loading = false;
      try {
        gitRepoStore.subscribe((v: any) => {
          repo = v.repo;
          loading = v.repoLoading || v.syncing || v.availabilityLoading;
        })();
      } catch {}
      if (loading) return null;
      if (!repo) return null;
      const unstagedLen = (repo.unstaged?.length ?? 0) + (repo.untracked?.length ?? 0);
      const count = (repo.staged?.length ?? 0) + unstagedLen + (repo.conflicted?.length ?? 0);
      if (count === 0) return null;
      return count > 99 ? '99+' : String(count);
    },
    getBadgeLoading: () => {
      let loading = false;
      try {
        gitRepoStore.subscribe((v: any) => {
          loading = v.repoLoading || v.syncing || v.availabilityLoading;
        })();
      } catch {}
      return loading;
    },
  },
  { id: 'run', label: 'Run', tooltip: 'Run (Ctrl+Shift+D)', shortcut: 'Ctrl+Shift+D', viewId: 'run', order: 4, icon: 'run' }
];

// Sidebar views

export const SIDEBAR_VIEWS: SidebarView[] = [
  {
    id: 'explorer',
    title: 'Explorer',
    order: 1,
    loadComponent: () => import('../components/explorer/FileTree.svelte').then((m) => m.default)
  },
  {
    id: 'search',
    title: 'Search',
    order: 2,
    loadComponent: () => import('../components/panels/SearchPanel.svelte').then((m) => m.default)
  },
  {
    id: 'git',
    title: 'Source Control',
    order: 3,
    // Generic view: renders every registered SCM provider (Git is one).
    loadComponent: () => import('../components/panels/ScmView.svelte').then((m) => m.default)
  },
  {
    id: 'run',
    title: 'Run',
    order: 4,
    loadComponent: () => import('../components/panels/RunPanel.svelte').then((m) => m.default)
  }
];

// Bottom panel (problems/output/terminal)

export const BOTTOM_PANEL_ITEMS: BottomPanelItem[] = [
  { id: 'problems', label: 'Problems', order: 1 },
  { id: 'output', label: 'Output', order: 2 },
  { id: 'terminal', label: 'Terminal', order: 3 }
];

// Populate the live registries used by the shell.
activityBarRegistry.registerAll(ACTIVITY_BAR_ITEMS as any);
sidebarRegistry.registerAll(SIDEBAR_VIEWS as any);
bottomPanelRegistry.registerAll(BOTTOM_PANEL_ITEMS as any);

// View / Panel title menus (the "..." affordance in each View header).
// Each View and Panel is its own menu container, so an action here is one
// registration, not an inline handler in the header markup.
menuRegistry.registerAll([
  // Explorer view title
  { id: 'view.explorer.newFile', menuId: 'view/explorer/title', label: 'New File', command: 'explorer.newFile', group: '1_new', order: 1 },
  { id: 'view.explorer.newFolder', menuId: 'view/explorer/title', label: 'New Folder', command: 'explorer.newFolder', group: '1_new', order: 2 },
  { id: 'view.explorer.refresh', menuId: 'view/explorer/title', label: 'Refresh', command: 'workbench.action.explorer.refresh', group: '2_view', order: 1 },
  { id: 'view.explorer.collapseAll', menuId: 'view/explorer/title', label: 'Collapse All', command: 'workbench.action.explorer.collapseAll', group: '2_view', order: 2 },
  { id: 'view.explorer.toggleDotFiles', menuId: 'view/explorer/title', label: 'Toggle Hidden Files', command: 'explorer.toggleDotFiles', group: '2_view', order: 3 },

  // Search view title
  { id: 'view.search.refresh', menuId: 'view/search/title', label: 'Refresh', command: 'workbench.action.search.refresh', group: '1_view', order: 1 },
  { id: 'view.search.collapseAll', menuId: 'view/search/title', label: 'Collapse All', command: 'workbench.action.search.collapseAll', group: '1_view', order: 2 },

  // Source Control view title
  { id: 'view.git.refresh', menuId: 'view/git/title', label: 'Refresh', command: 'git.refresh', group: '1_view', order: 1 },
  { id: 'view.git.stageAll', menuId: 'view/git/title', label: 'Stage All Changes', command: 'git.stageAll', group: '2_changes', order: 1 },
  { id: 'view.git.unstageAll', menuId: 'view/git/title', label: 'Unstage All Changes', command: 'git.unstageAll', group: '2_changes', order: 2 },
  { id: 'view.git.pull', menuId: 'view/git/title', label: 'Pull', command: 'git.pull', group: '3_sync', order: 1 },
  { id: 'view.git.push', menuId: 'view/git/title', label: 'Push', command: 'git.push', group: '3_sync', order: 2 },
  { id: 'view.git.fetch', menuId: 'view/git/title', label: 'Fetch', command: 'git.fetch', group: '3_sync', order: 3 },
  { id: 'view.git.openOutput', menuId: 'view/git/title', label: 'Show Git Output', command: 'git.openOutput', group: '4_output', order: 1 },

  // Run view title
  { id: 'view.run.start', menuId: 'view/run/title', label: 'Start Configuration', command: 'workbench.action.run', group: '1_run', order: 1 },
  { id: 'view.run.currentFile', menuId: 'view/run/title', label: 'Run Current File', command: 'workbench.action.runCurrentFile', group: '1_run', order: 2 },
  { id: 'view.run.stop', menuId: 'view/run/title', label: 'Stop', command: 'workbench.action.stopRun', group: '1_run', order: 3 },
  { id: 'view.run.openLaunchJson', menuId: 'view/run/title', label: 'Open launch.json', command: 'run.openLaunchJson', group: '2_config', order: 1 },
  { id: 'view.run.createLaunchJson', menuId: 'view/run/title', label: 'Create launch.json', command: 'run.createLaunchJson', group: '2_config', order: 2 },

  // Bottom panel title menus
  { id: 'panel.terminal.new', menuId: 'panel/terminal/title', label: 'New Terminal', command: 'workbench.action.terminal.new', group: '1_terminal', order: 1 },
  { id: 'panel.terminal.kill', menuId: 'panel/terminal/title', label: 'Kill Terminal', command: 'workbench.action.terminal.killActive', group: '1_terminal', order: 2 },
  { id: 'panel.terminal.clear', menuId: 'panel/terminal/title', label: 'Clear', command: 'workbench.action.terminal.clear', group: '2_panel', order: 1 },
  { id: 'panel.terminal.maximize', menuId: 'panel/terminal/title', label: 'Toggle Maximize Panel', command: 'workbench.action.terminal.maximize', group: '2_panel', order: 2 },
  { id: 'panel.output.clear', menuId: 'panel/output/title', label: 'Clear Output', command: 'workbench.action.terminal.clear', group: '2_panel', order: 1 },
  { id: 'panel.output.showGit', menuId: 'panel/output/title', label: 'Show Git Output', command: 'git.openOutput', group: '1_output', order: 1 },
]);

// Title menu bar — declarative, references command IDs

export function getMenuBarContributions(ctx: {
  isFileActive: () => boolean;
  isMinimapEnabled: () => boolean;
  isBreadcrumbsEnabled: () => boolean;
  isStickyScrollEnabled: () => boolean;
  isStatusBarEnabled: () => boolean;
  hasWelcomeTab: () => boolean;
  terminalCount: () => number;
  isTerminalVisible: () => boolean;
  handlers: {
    newTextFile: () => void;
    newFileDialog: () => void;
    newWindow: () => void;
    openFile: () => void;
    openFolder: () => void;
    openRecent: () => void;
    save: () => void;
    saveAs: () => void;
    exit: () => void;
    openSearch: () => void;
    openExplorer: () => void;
    dispatch: (action: string) => void;
    reopenClosed: () => void;
    revealWelcome: () => void;
    toggleMinimap: () => void;
    toggleBreadcrumbs: () => void;
    toggleStickyScroll: () => void;
    toggleStatusBar: () => void;
    openTerminal: () => void;
    newTerminal: () => void;
    setTerminalPanel: (p: string) => void;
  };
}): MenuBarContribution[] {
  const cmdDisabled = () => !ctx.isFileActive();
  return [
    {
      label: 'File',
      items: [
        { label: 'New Text File', command: 'workbench.action.newUntitledFile' },
        { label: 'New File', shortcut: 'Ctrl+N', command: undefined },
        // Note: handlers below wrap commandRegistry where needed; menu renderer falls back to direct action
        { label: 'New Window', shortcut: 'Ctrl+Shift+N', command: undefined },
        { label: 'Open File', shortcut: 'Ctrl+O', command: undefined },
        { label: 'Open Folder', command: undefined },
        { label: 'Open Recent...', separator: true, command: undefined },
        { label: 'Save', shortcut: 'Ctrl+S', disabled: cmdDisabled, command: 'workbench.action.save' },
        { label: 'Save As', shortcut: 'Ctrl+Shift+S', disabled: cmdDisabled, separator: true, command: 'workbench.action.saveAs' },
        { label: 'Exit', command: undefined }
      ]
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', disabled: cmdDisabled, command: undefined },
        { label: 'Redo', shortcut: 'Ctrl+Y', disabled: cmdDisabled, separator: true, command: undefined },
        { label: 'Cut', shortcut: 'Ctrl+X', command: undefined },
        { label: 'Copy', shortcut: 'Ctrl+C', command: undefined },
        { label: 'Paste', shortcut: 'Ctrl+V', separator: true, command: undefined },
        { label: 'Find', shortcut: 'Ctrl+F', disabled: cmdDisabled, command: 'editor.action.find' },
        { label: 'Replace', shortcut: 'Ctrl+H', disabled: cmdDisabled, separator: true, command: 'editor.action.replace' },
        { label: 'Reopen Closed Tab', shortcut: 'Ctrl+Shift+T', separator: true, command: 'workbench.action.reopenClosedTab' },
        { label: 'Find in Files', shortcut: 'Ctrl+Shift+F', command: 'workbench.action.showSearch' },
        { label: 'Replace in Files', shortcut: 'Ctrl+Shift+H', command: 'workbench.action.showSearch' }
      ]
    },
    {
      label: 'Selection',
      items: [
        { label: 'Select All', shortcut: 'Ctrl+A', disabled: cmdDisabled, separator: true, command: undefined },
        { label: 'Copy Line Up', shortcut: 'Shift+Alt+Up', disabled: cmdDisabled, command: undefined },
        { label: 'Copy Line Down', shortcut: 'Shift+Alt+Down', disabled: cmdDisabled, command: undefined },
        { label: 'Move Line Up', shortcut: 'Alt+Up', disabled: cmdDisabled, command: undefined },
        { label: 'Move Line Down', shortcut: 'Alt+Down', disabled: cmdDisabled, separator: true, command: undefined },
        { label: 'Duplicate Selection', disabled: cmdDisabled, command: undefined }
      ]
    },
    {
      label: 'View',
      items: [
        { label: 'Command Palette', shortcut: 'Ctrl+Shift+P', separator: true, command: 'workbench.action.showCommands' },
        { label: 'Explorer', shortcut: 'Ctrl+Shift+E', command: 'workbench.action.showExplorer' },
        { label: 'Search', shortcut: 'Ctrl+Shift+F', command: 'workbench.action.showSearch' },
        { label: 'Terminal', shortcut: 'Ctrl+`', command: undefined },
        { label: 'Problems', command: undefined },
        { label: 'Output', separator: true, command: undefined },
        { label: 'Welcome Page', checked: () => ctx.hasWelcomeTab(), command: undefined },
        { label: 'Minimap', checked: () => ctx.isMinimapEnabled(), command: undefined },
        { label: 'Breadcrumbs', checked: () => ctx.isBreadcrumbsEnabled(), command: undefined },
        { label: 'Sticky Scroll', checked: () => ctx.isStickyScrollEnabled(), separator: true, command: undefined },
        { label: 'Status Bar', checked: () => ctx.isStatusBarEnabled(), command: undefined }
      ]
    }
  ];
}

// Helpers

export function getSidebarView(id: string): SidebarView | undefined {
  return SIDEBAR_VIEWS.find((v) => v.id === id);
}

export function getActivityBarItem(viewId: string): ActivityBarItem | undefined {
  return ACTIVITY_BAR_ITEMS.find((a) => a.viewId === viewId);
}