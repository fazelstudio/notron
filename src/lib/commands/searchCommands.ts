/**
 * Search Commands
 */

import { commandRegistry } from './registry';
import { uiStore } from '../stores/ui';

function reg(id: string, label: string, category: string, action: (...args:any[])=>any) { if (!commandRegistry.has(id)) commandRegistry.register({ id, label, category, action }); }
reg('workbench.action.search.refresh', 'Search: Refresh', 'Search', () => uiStore.triggerSearchRefresh());
reg('workbench.action.search.collapseAll', 'Search: Collapse All', 'Search', () => uiStore.triggerSearchCollapseAll());
reg('workbench.action.explorer.refresh', 'Explorer: Refresh', 'File', () => uiStore.triggerExplorerRefresh());
reg('workbench.action.explorer.collapseAll', 'Explorer: Collapse All', 'File', () => uiStore.triggerExplorerCollapse());
