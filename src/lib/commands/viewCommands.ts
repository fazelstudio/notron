/**
 * View Commands
 *
 * Registers view/layout toggles that were previously direct store calls.
 */

import { commandRegistry } from './registry';
import { uiStore } from '../stores/ui';
function reg(id: string, label: string, category: string, action: (...args:any[])=>any) { if (!commandRegistry.has(id)) commandRegistry.register({ id, label, category, action }); }
reg('workbench.action.toggleSidebarVisibility', 'View: Toggle Primary Side Bar', 'View', () => { uiStore.toggleSidebar(); });
reg('workbench.action.toggleSidebar', 'View: Toggle Sidebar', 'View', () => { uiStore.toggleSidebar(); });
reg('workbench.view.explorer', 'View: Show Explorer', 'View', () => { uiStore.setSidebarOpen(true); uiStore.setActiveSidebarPanel('explorer'); });
reg('workbench.view.search', 'View: Show Search', 'View', () => { uiStore.setSidebarOpen(true); uiStore.setActiveSidebarPanel('search'); });
reg('workbench.view.scm', 'View: Show Source Control', 'View', () => { uiStore.setSidebarOpen(true); uiStore.setActiveSidebarPanel('git'); });
reg('workbench.view.debug', 'View: Show Run and Debug', 'View', () => { uiStore.setSidebarOpen(true); uiStore.setActiveSidebarPanel('run'); });
reg('workbench.action.showCommands', 'Show All Commands', 'View', () => { void window.dispatchEvent(new CustomEvent('open-command-palette')); });
reg('workbench.action.quickOpen', 'Quick Open', 'View', () => { void window.dispatchEvent(new CustomEvent('quick-open', { detail: '' })); });
reg('workbench.action.gotoLine', 'Go to Line', 'View', () => { void window.dispatchEvent(new CustomEvent('open-goto-line')); });
reg('workbench.action.navigateBack', 'Go Back', 'Go', () => import('../stores/navigation').then(m => m.navigationStore.navigateBack()));
reg('workbench.action.navigateForward', 'Go Forward', 'Go', () => import('../stores/navigation').then(m => m.navigationStore.navigateForward()));
reg('workbench.action.toggleMinimap', 'View: Toggle Minimap', 'View', () => { uiStore.toggleMinimap(); });
reg('workbench.action.toggleBreadcrumbs', 'View: Toggle Breadcrumbs', 'View', () => { uiStore.toggleBreadcrumbs(); });
reg('workbench.action.toggleStickyScroll', 'View: Toggle Sticky Scroll', 'View', () => { uiStore.toggleStickyScroll(); });
reg('workbench.action.toggleStatusbarVisibility', 'View: Toggle Status Bar', 'View', () => { uiStore.toggleStatusBar(); });
reg('workbench.action.findInFiles', 'Search: Find in Files', 'Search', () => { uiStore.setSidebarOpen(true); uiStore.setActiveSidebarPanel('search'); });
reg('workbench.action.replaceInFiles', 'Search: Replace in Files', 'Search', () => { uiStore.setSidebarOpen(true); uiStore.setActiveSidebarPanel('search'); });
reg('workbench.action.openSettings', 'Preferences: Open Settings', 'Preferences', () => { void window.dispatchEvent(new CustomEvent('open-settings')); });
reg('explorer.open', 'Explorer: Open', 'File', (path?: string) => {
  if (typeof path === 'string') import('../utils/eventBus').then(({ eventBus }) => eventBus.emit('request-open-file', { path }));
});
reg('explorer.openToSide', 'Explorer: Open to the Side', 'File', (path?: string) => {
  const p = typeof path === 'string' ? path : undefined;
  import('../utils/eventBus').then(({ eventBus }) => {
    const fallback = uiStore.getSnapshot().selectedExplorerPath;
    const target = p ?? fallback;
    if (target) eventBus.emit('request-open-file-split', { path: target });
  });
});
reg('workbench.action.showWelcomePage', 'View: Show Welcome Page', 'View', () => {
  import('../stores/editor').then(({ editorStore }) => {
    const tabs = editorStore.getTabsSnapshot();
    const w = tabs.find((t: any) => t.language === 'welcome');
    if (w) editorStore.setActiveTab(w.id);
    else editorStore.addTab({ id: 'welcome', path: 'Welcome', name: 'Welcome', content: '', language: 'welcome', isPreview: true });
  });
});
