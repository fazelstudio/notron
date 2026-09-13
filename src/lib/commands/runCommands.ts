/**
 * Run Commands
 *
 * Registers Run/Debug commands.
 */

import { commandRegistry } from './registry';
import { runSelectedConfiguration, runCurrentFile, stopActiveRuns, createLaunchJsonFile, openLaunchJson, openFileForRunning } from '../services/runService';

function reg(id: string, label: string, category: string, action: (...args:any[])=>any) { if (!commandRegistry.has(id)) commandRegistry.register({ id, label, category, action }); }
reg('workbench.action.run', 'Run: Start Configuration', 'Run', () => runSelectedConfiguration());
reg('workbench.action.runCurrentFile', 'Run: Current File', 'Run', () => runCurrentFile());
reg('workbench.action.stopRun', 'Run: Stop', 'Run', async () => { await stopActiveRuns(); });
reg('workbench.action.debug.run', 'Run Code', 'Run', () => runCurrentFile());
reg('run.createLaunchJson', 'Run: Create launch.json', 'Run', () => createLaunchJsonFile());
reg('run.openLaunchJson', 'Run: Open launch.json', 'Run', () => openLaunchJson());
reg('run.openFileForRunning', 'Run: Open File for Running', 'Run', () => openFileForRunning());
