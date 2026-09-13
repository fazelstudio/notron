/**
 * Debug
 *
 * Typed stub for debug sessions. Factories are kept in memory; starting a session needs a host.
 */
import type { Disposable, Event, WorkspaceFolder } from './types.js';
import { Emitter, toDisposable } from './types.js';
import { NotImplementedError } from '../host/errors.js';

export interface DebugConfiguration {
  type: string;
  name: string;
  request: 'launch' | 'attach';
  program?: string;
  cwd?: string;
  args?: string[];
  env?: Record<string, string>;
  stopOnEntry?: boolean;
  [key: string]: unknown;
}

export interface DebugSession {
  id: string;
  type: string;
  name: string;
  workspaceFolder: WorkspaceFolder | undefined;
  configuration: DebugConfiguration;
}

export type DebugAdapterExecutable = {
  type: 'executable';
  command: string;
  args?: string[];
  options?: { cwd?: string; env?: Record<string, string> };
};

export type DebugAdapterServer = {
  type: 'server';
  port: number;
  host?: string;
};

export type DebugAdapterDescriptor = DebugAdapterExecutable | DebugAdapterServer | { type: 'pipe' };

export interface DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(
    session: DebugSession,
    executable: DebugAdapterExecutable | undefined,
  ): Promise<DebugAdapterDescriptor | null | undefined> | DebugAdapterDescriptor | null | undefined;
}

export interface DebugDelegate {
  registerDebugAdapterDescriptorFactory?(debugType: string, factory: DebugAdapterDescriptorFactory): Disposable;
  startDebugging?(folder: WorkspaceFolder | undefined, config: DebugConfiguration): Promise<boolean>;
  onDidStartDebugSession?: Event<DebugSession>;
  onDidTerminateDebugSession?: Event<DebugSession>;
}

let debugDelegate: DebugDelegate | null = null;

export function setDebugDelegate(d: DebugDelegate | null): void {
  debugDelegate = d;
}

export function getDebugDelegate(): DebugDelegate | null {
  return debugDelegate;
}

const adapterFactories = new Map<string, DebugAdapterDescriptorFactory>();
const declaredDebuggers: Array<{ type: string; label: string; program?: string; extensionId?: string }> = [];

const didStartEmitter = new Emitter<DebugSession>();
const didTerminateEmitter = new Emitter<DebugSession>();

let sessionCounter = 0;

export function __registerDebugger(contrib: { type: string; label: string; program?: string; extensionId?: string }): Disposable {
  declaredDebuggers.push(contrib);
  return toDisposable(() => {
    const idx = declaredDebuggers.indexOf(contrib);
    if (idx !== -1) declaredDebuggers.splice(idx, 1);
  });
}

export function __getDeclaredDebuggers(): Array<{ type: string; label: string; program?: string; extensionId?: string }> {
  return [...declaredDebuggers];
}

export function registerDebugAdapterDescriptorFactory(
  debugType: string,
  factory: DebugAdapterDescriptorFactory,
): Disposable {
  if (!debugType || !debugType.trim()) throw new TypeError('[debug] debugType must be non-empty string');
  if (!factory || typeof factory.createDebugAdapterDescriptor !== 'function') {
    throw new TypeError('[debug] factory must implement createDebugAdapterDescriptor');
  }
  if (debugDelegate?.registerDebugAdapterDescriptorFactory) {
    return debugDelegate.registerDebugAdapterDescriptorFactory(debugType, factory);
  }
  if (adapterFactories.has(debugType)) {
    console.warn(`[debug] overwriting DebugAdapterDescriptorFactory for "${debugType}"`);
  }
  adapterFactories.set(debugType, factory);
  // Warn once when host is not available.
  if (!warnedStub) {
    warnedStub = true;
    console.warn(
      '[debug] registerDebugAdapterDescriptorFactory stored in SDK in-memory registry. ' +
        'Notron core does not yet host a Debug Adapter Protocol runtime — debug sessions will not actually start ' +
        '(see NOTRON_SDK_01_API_SURFACE , gap low priority; typed stub).',
    );
  }
  return toDisposable(() => {
    if (adapterFactories.get(debugType) === factory) adapterFactories.delete(debugType);
  });
}

let warnedStub = false;

export async function startDebugging(
  folder: WorkspaceFolder | undefined,
  config: DebugConfiguration,
): Promise<boolean> {
  if (!config || typeof config.type !== 'string' || typeof config.name !== 'string') {
    throw new TypeError('[debug] startDebugging: config must have string type and name');
  }
  if (debugDelegate?.startDebugging) {
    const ok = await debugDelegate.startDebugging(folder, config);
    void ok;
    return ok;
  }
  throw new NotImplementedError(
    'debug.startDebugging',
    `Notron core does not yet implement Debug Adapter Protocol. Debug type "${config.type}" (request: ${config.request}) cannot be launched. ` +
      'Use Run (workbench.action.run / runService) as interim for running without debugging. ' +
      'Declarative debuggers from manifest remain inspectable via __getDeclaredDebuggers().',
  );
}

export const onDidStartDebugSession: Event<DebugSession> = (listener, thisArg, disposables) => {
  if (debugDelegate?.onDidStartDebugSession) {
    return debugDelegate.onDidStartDebugSession(listener as (e: DebugSession) => unknown, thisArg, disposables);
  }
  return didStartEmitter.event(listener as (e: DebugSession) => unknown, thisArg, disposables);
};

export const onDidTerminateDebugSession: Event<DebugSession> = (listener, thisArg, disposables) => {
  if (debugDelegate?.onDidTerminateDebugSession) {
    return debugDelegate.onDidTerminateDebugSession(listener as (e: DebugSession) => unknown, thisArg, disposables);
  }
  return didTerminateEmitter.event(listener as (e: DebugSession) => unknown, thisArg, disposables);
};

export function __getAdapterFactories(): Map<string, DebugAdapterDescriptorFactory> {
  return adapterFactories;
}

export function __fireDidStartDebugSession(session: DebugSession): void {
  didStartEmitter.fire(session);
}

export function __fireDidTerminateDebugSession(session: DebugSession): void {
  didTerminateEmitter.fire(session);
}

export function __clearDebug(): void {
  adapterFactories.clear();
  declaredDebuggers.length = 0;
  warnedStub = false;
  sessionCounter = 0;
  void sessionCounter;
}

export const debug = {
  registerDebugAdapterDescriptorFactory,
  startDebugging,
  onDidStartDebugSession,
  onDidTerminateDebugSession,
} as const;

export const debugNamespace = debug;
