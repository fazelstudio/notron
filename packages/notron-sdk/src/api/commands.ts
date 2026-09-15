/**
 * Commands
 *
 * Command registry with in-memory fallback and host delegation.
 */
import type { Disposable } from './types.js';
import { toDisposable } from './types.js';
import { ExtensionRuntimeError } from '../host/errors.js';

export type CommandHandler = (...args: unknown[]) => unknown | Promise<unknown>;

interface RegisteredCommand {
  id: string;
  handler: CommandHandler;
  extensionId?: string;
}

interface CommandContributionDescriptor {
  command: string;
  title: string;
  category?: string;
  icon?: string;
  enablement?: string;
}

export interface CommandContributionDelegate {
  registerCommandContribution?(contribution: CommandContributionDescriptor, extensionId: string): Disposable;
}

let contributionDelegate: CommandContributionDelegate | null = null;

export function setCommandContributionDelegate(d: CommandContributionDelegate | null): void {
  contributionDelegate = d;
}

export function __registerCommandContribution(
  contribution: CommandContributionDescriptor,
  extensionId: string,
): Disposable {
  if (!contribution.command || !contribution.title) {
    throw new TypeError('[commands] contribution requires command and title');
  }
  if (contributionDelegate?.registerCommandContribution) {
    return contributionDelegate.registerCommandContribution(contribution, extensionId);
  }
  return toDisposable(() => {});
}

export interface CommandDelegate {
  executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined>;
  getCommands(filterInternal?: boolean): Promise<string[]>;
  hasCommand?(id: string): boolean;
}

let delegate: CommandDelegate | null = null;

export function setCommandDelegate(d: CommandDelegate | null): void {
  delegate = d;
}

export function getCommandDelegate(): CommandDelegate | null {
  return delegate;
}

type CommandMirror = {
  register: (id: string, handler: CommandHandler) => Disposable;
};

let commandMirror: CommandMirror | null = null;

export function __setCommandMirror(m: CommandMirror | null): void {
  commandMirror = m;
}

const registry = new Map<string, RegisteredCommand>();

const KNOWN_CORE_COMMANDS = new Set<string>([
  'workbench.action.newUntitledFile',
  'workbench.action.toggleSidebar',
  'workbench.action.openSettings',
  'workbench.action.gotoLine',
  'workbench.action.navigateBack',
  'workbench.action.navigateForward',
  'workbench.action.run',
  'workbench.action.runCurrentFile',
  'workbench.action.stopRun',
  'workbench.action.reloadWindow',
  'workbench.action.closeWindow',
  'workbench.action.closeFolder',
  'workbench.action.closeWorkspace',
  'workbench.action.explorer.newFile',
  'workbench.action.explorer.newFolder',
  'workbench.action.explorer.refresh',
  'workbench.action.explorer.collapseAll',
  'workbench.action.files.newUntitledFile',
  'workbench.action.files.newFile',
  'workbench.action.files.openFile',
  'workbench.action.files.openFolder',
  'workbench.action.openRecent',
  'workbench.action.newWindow',
  'window.newWindow',
  'workbench.action.files.save',
  'workbench.action.files.saveAs',
  'workbench.action.reopenClosedEditor',
  'editor.action.undo',
  'editor.action.redo',
  'editor.action.selectAll',
  'editor.action.copyLinesUpAction',
  'editor.action.copyLinesDownAction',
  'editor.action.moveLinesUpAction',
  'editor.action.moveLinesDownAction',
  'editor.action.find',
  'editor.action.replace',
  'actions.find',
  'editor.action.startFindReplaceAction',
  'editor.action.revealDefinition',
  'editor.action.referenceSearch.trigger',
  'workbench.action.debug.run',
  'editor.action.clipboardCutAction',
  'editor.action.clipboardCopyAction',
  'editor.action.clipboardPasteAction',
  'explorer.newFile',
  'explorer.newFolder',
  'explorer.refresh',
  'explorer.collapseAll',
  'explorer.copy',
  'explorer.cut',
  'explorer.paste',
  'explorer.duplicate',
  'explorer.rename',
  'explorer.delete',
  'explorer.copyPath',
  'explorer.copyRelativePath',
  'explorer.revealInFileManager',
  'explorer.openInTerminal',
  'explorer.openToSide',
  'explorer.toggleDotFiles',
  'explorer.open',
  'workbench.action.closeActiveEditor',
  'workbench.action.closeOtherEditors',
  'workbench.action.closeEditorsToTheRight',
  'workbench.action.pinEditor',
  'workbench.action.splitEditorRight',
  'workbench.action.splitEditorDown',
  'workbench.action.splitEditorLeft',
  'workbench.action.splitEditorUp',
  'workbench.action.focusActiveEditorGroup',
  'workbench.action.closeAllEditors',
  'workbench.action.toggleSidebarVisibility',
  'workbench.view.explorer',
  'workbench.view.search',
  'workbench.view.scm',
  'workbench.view.debug',
  'workbench.action.showCommands',
  'workbench.action.quickOpen',
  'workbench.action.toggleMinimap',
  'workbench.action.toggleBreadcrumbs',
  'workbench.action.toggleStickyScroll',
  'workbench.action.toggleStatusbarVisibility',
  'workbench.action.findInFiles',
  'workbench.action.replaceInFiles',
  'workbench.action.showWelcomePage',
  'workbench.action.search.refresh',
  'workbench.action.search.collapseAll',
  'workbench.action.terminal.new',
  'workbench.action.terminal.toggleTerminal',
  'workbench.action.terminal.killActive',
  'workbench.action.terminal.clear',
  'workbench.action.terminal.maximize',
  'workbench.action.terminal.show',
  'workbench.action.terminal.hide',
  'workbench.actions.view.problems',
  'workbench.actions.view.output',
  'git.init',
  'git.refresh',
  'git.stageAll',
  'git.unstageAll',
  'git.commit',
  'git.push',
  'git.pull',
  'git.fetch',
  'git.publish',
  'git.cancel',
  'git.reDetect',
  'git.openOutput',
  'git.stage',
  'git.unstage',
  'git.discard',
  'run.createLaunchJson',
  'run.openLaunchJson',
  'run.openFileForRunning',
  'workbench.action.preview.showCode',
  'workbench.action.preview.showPreview',
  'workbench.action.preview.showSplit',
  'workbench.action.openRecentWorkspace',
  'window.minimize',
  'window.maximize',
  'window.close',
  'window.reload',
]);

export function registerCommand(
  id: string,
  handler: CommandHandler,
  extensionId?: string,
): Disposable {
  if (!id || typeof id !== 'string' || !id.trim()) {
    throw new TypeError('[commands] registerCommand: id must be non-empty string (expected `namespace.action`)');
  }
  if (typeof handler !== 'function') {
    throw new TypeError('[commands] registerCommand: handler must be a function');
  }
  const existing = registry.get(id);
  if (existing) {
    if (extensionId && existing.extensionId === extensionId) {
      registry.set(id, { id, handler, extensionId });
      return toDisposable(() => {
        if (registry.get(id)?.handler === handler) registry.delete(id);
      });
    }
    throw new Error(`[commands] Command "${id}" already registered by ${existing.extensionId ?? 'unknown'}`);
  }
  registry.set(id, { id, handler, extensionId });
  // Mirror to host command registry so palette/menus see SDK commands without dual registration.
  let mirrorDisposable: Disposable | null = null;
  if (commandMirror) {
    try {
      mirrorDisposable = commandMirror.register(id, handler);
    } catch { /* ignore */ }
  }
  return toDisposable(() => {
    const cur = registry.get(id);
    if (cur && cur.handler === handler) registry.delete(id);
    try { mirrorDisposable?.dispose(); } catch { /* ignore */ }
  });
}

export async function getCommands(filterInternal?: boolean): Promise<string[]> {
  const extensionIds = [...registry.keys()];
  let coreIds: string[] = [];
  if (delegate) {
    try {
      coreIds = await delegate.getCommands(filterInternal);
    } catch {
      coreIds = [...KNOWN_CORE_COMMANDS];
    }
  } else {
    coreIds = [...KNOWN_CORE_COMMANDS];
  }
  const merged = new Set<string>([...coreIds, ...extensionIds]);
  let result = [...merged];
  if (filterInternal) {
    result = result.filter((id) => !id.startsWith('_'));
  }
  result.sort();
  return result;
}

export async function executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T | undefined> {
  if (!id || typeof id !== 'string') {
    throw new TypeError('[commands] executeCommand: id must be string');
  }

  const local = registry.get(id);
  if (local) {
    try {
      const result = await local.handler(...args);
      return result as T;
    } catch (err) {
      const wrapped = new ExtensionRuntimeError(local.extensionId ?? 'unknown', `command:${id}`, err);
      console.error(wrapped.message, err);
      throw wrapped;
    }
  }

  if (delegate) {
    try {
      return await delegate.executeCommand<T>(id, ...args);
    } catch (err) {
      throw new ExtensionRuntimeError('host', `executeCommand:${id}`, err);
    }
  }

  console.warn(`[commands] executeCommand: unknown command "${id}" (no delegate and not registered)`);
  return undefined;
}

export function __getRegisteredIds(): string[] {
  return [...registry.keys()];
}

export function __clearRegistry(): void {
  registry.clear();
}

export function __isKnownCoreCommand(id: string): boolean {
  return KNOWN_CORE_COMMANDS.has(id);
}

export const commands = {
  registerCommand,
  executeCommand,
  getCommands,
} as const;
