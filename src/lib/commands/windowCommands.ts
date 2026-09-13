/**
 * Window Commands
 *
 * Registers window control commands.
 */

import { commandRegistry } from './registry';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

function reg(id: string, label: string, category: string, action: (...args:any[])=>any) { if (!commandRegistry.has(id)) commandRegistry.register({ id, label, category, action }); }
reg('window.minimize', 'Minimize Window', 'Window', () => getCurrentWindow().minimize());
reg('window.maximize', 'Maximize Window', 'Window', () => getCurrentWindow().toggleMaximize());
reg('window.close', 'Close Window', 'Window', () => getCurrentWindow().close());
reg('window.reload', 'Developer: Reload Window', 'Window', () => window.location.reload());
reg('window.newWindow', 'New Window', 'Window', async () => {
  try { await invoke('open_new_window'); } catch (e) { console.error('Failed to open new window', e); }
});
reg('workbench.action.newWindow', 'File: New Window', 'File', async () => {
  try { await invoke('open_new_window'); } catch (e) { console.error('Failed to open new window', e); }
});
reg('workbench.action.closeWindow', 'File: Close Window', 'File', () => getCurrentWindow().close());
reg('workbench.action.reloadWindow', 'Developer: Reload Window', 'File', () => window.location.reload());
