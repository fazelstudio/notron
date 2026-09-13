/**
 * Tasks
 *
 * Task providers with in-memory fallback and host delegation.
 */
import type { Disposable, Event } from './types.js';
import { Emitter, toDisposable } from './types.js';

export interface TaskDefinition {
  type: string;
  [key: string]: unknown;
}

export interface TaskGroup {
  id: 'build' | 'test' | 'none';
  isDefault?: boolean;
}

export interface Task {
  definition: TaskDefinition;
  name: string;
  source: string;
  scope?: string;
  detail?: string;
  group?: TaskGroup | string;
  presentationOptions?: { reveal?: string; panel?: number };
  problemMatchers?: string[];
  execution?: ShellExecution | ProcessExecution | CustomExecution;
}

export class ShellExecution {
  constructor(
    public readonly commandLine: string | undefined,
    public readonly args: string[] = [],
    public readonly options?: { cwd?: string; env?: Record<string, string> },
  ) {}
}

export class ProcessExecution {
  constructor(
    public readonly process: string,
    public readonly args: string[] = [],
    public readonly options?: { cwd?: string; env?: Record<string, string> },
  ) {}
}

export class CustomExecution {
  constructor(public readonly callback: (resolved: TaskDefinition) => Promise<number>) {}
}

export interface TaskProvider {
  provideTasks(token?: unknown): Promise<Task[] | undefined | null> | Task[] | undefined | null;
  resolveTask?(task: Task, token?: unknown): Promise<Task | undefined | null> | Task | undefined | null;
}

export interface TaskExecution {
  task: Task;
  terminate(): void;
}

export interface TaskStartEvent {
  execution: TaskExecution;
}

export interface TaskEndEvent {
  execution: TaskExecution;
}

export interface TaskProcessStartEvent {
  execution: TaskExecution;
  processId: number;
}

export interface TaskProcessEndEvent {
  execution: TaskExecution;
  exitCode: number | undefined;
}

export interface TasksDelegate {
  registerTaskProvider?(type: string, provider: TaskProvider): Disposable;
  executeTask?(task: Task): Promise<TaskExecution>;
  fetchTasks?(filter?: { type?: string }): Promise<Task[]>;
  onDidStartTask?: Event<TaskStartEvent>;
  onDidEndTask?: Event<TaskEndEvent>;
}

let tasksDelegate: TasksDelegate | null = null;

export function setTasksDelegate(d: TasksDelegate | null): void {
  tasksDelegate = d;
}

export function getTasksDelegate(): TasksDelegate | null {
  return tasksDelegate;
}

interface ProviderEntry {
  type: string;
  provider: TaskProvider;
}

const providers: ProviderEntry[] = [];
const declaredTaskDefinitions: Array<{ type: string; properties?: Record<string, unknown>; extensionId?: string }> = [];

const didStartEmitter = new Emitter<TaskStartEvent>();
const didEndEmitter = new Emitter<TaskEndEvent>();
const didStartProcessEmitter = new Emitter<TaskProcessStartEvent>();
const didEndProcessEmitter = new Emitter<TaskProcessEndEvent>();

const activeExecutions = new Set<TaskExecutionImpl>();
let warnedStub = false;

function warnOnce(): void {
  if (warnedStub) return;
  warnedStub = true;
  console.warn(
    '[tasks] Task provider registered in SDK in-memory registry. ' +
      'Notron core has taskRegistry (npm/cargo) and runService, but SDK executeTask is not yet wired to host terminal. ' +
      'Fallback execution emits onDidStartTask/onDidEndTask without spawning a real shell (gap low priority). ' +
      'Inject TasksDelegate to bridge to taskRegistry/runService.',
  );
}

class TaskExecutionImpl implements TaskExecution {
  terminated = false;
  constructor(public readonly task: Task) {}
  terminate(): void {
    this.terminated = true;
    if (activeExecutions.has(this)) {
      activeExecutions.delete(this);
      didEndEmitter.fire({ execution: this });
    }
  }
}

export function __registerTaskDefinition(contrib: { type: string; properties?: Record<string, unknown>; extensionId?: string }): Disposable {
  declaredTaskDefinitions.push(contrib);
  return toDisposable(() => {
    const idx = declaredTaskDefinitions.indexOf(contrib);
    if (idx !== -1) declaredTaskDefinitions.splice(idx, 1);
  });
}

export function __getDeclaredTaskDefinitions(): Array<{ type: string; properties?: Record<string, unknown>; extensionId?: string }> {
  return [...declaredTaskDefinitions];
}

export function registerTaskProvider(type: string, provider: TaskProvider): Disposable {
  if (!type || !type.trim()) throw new TypeError('[tasks] type must be non-empty string');
  if (!provider || typeof provider.provideTasks !== 'function') {
    throw new TypeError('[tasks] provider must implement provideTasks');
  }
  if (tasksDelegate?.registerTaskProvider) {
    return tasksDelegate.registerTaskProvider(type, provider);
  }
  warnOnce();
  const entry: ProviderEntry = { type, provider };
  providers.push(entry);
  return toDisposable(() => {
    const idx = providers.indexOf(entry);
    if (idx !== -1) providers.splice(idx, 1);
  });
}

export async function executeTask(task: Task): Promise<TaskExecution> {
  if (!task || typeof task.definition?.type !== 'string') {
    throw new TypeError('[tasks] task must have definition.type');
  }
  if (tasksDelegate?.executeTask) {
    return tasksDelegate.executeTask(task);
  }
  warnOnce();
  const exec = new TaskExecutionImpl(task);
  activeExecutions.add(exec);
  didStartEmitter.fire({ execution: exec });
  didStartProcessEmitter.fire({ execution: exec, processId: 9999 });
  queueMicrotask(() => {
    if (activeExecutions.has(exec) && !exec.terminated) {
      activeExecutions.delete(exec);
      didEndProcessEmitter.fire({ execution: exec, exitCode: 0 });
      didEndEmitter.fire({ execution: exec });
    }
  });
  return exec;
}

export async function fetchTasks(filter?: { type?: string }): Promise<Task[]> {
  if (tasksDelegate?.fetchTasks) {
    return tasksDelegate.fetchTasks(filter);
  }
  const all: Task[] = [];
  const relevant = filter?.type ? providers.filter((p) => p.type === filter.type) : providers;
  for (const { provider } of relevant) {
    try {
      const tasks = await provider.provideTasks();
      if (tasks) all.push(...tasks);
    } catch (err) {
      console.warn('[tasks] provider failed:', err);
    }
  }
  return all;
}

export const onDidStartTask: Event<TaskStartEvent> = (listener, thisArg, disposables) => {
  if (tasksDelegate?.onDidStartTask) return tasksDelegate.onDidStartTask(listener as (e: TaskStartEvent) => unknown, thisArg, disposables);
  return didStartEmitter.event(listener as (e: TaskStartEvent) => unknown, thisArg, disposables);
};

export const onDidEndTask: Event<TaskEndEvent> = (listener, thisArg, disposables) => {
  if (tasksDelegate?.onDidEndTask) return tasksDelegate.onDidEndTask(listener as (e: TaskEndEvent) => unknown, thisArg, disposables);
  return didEndEmitter.event(listener as (e: TaskEndEvent) => unknown, thisArg, disposables);
};

export const onDidStartTaskProcess: Event<TaskProcessStartEvent> = didStartProcessEmitter.event;
export const onDidEndTaskProcess: Event<TaskProcessEndEvent> = didEndProcessEmitter.event;

export function __getTaskProviders(): ProviderEntry[] {
  return [...providers];
}

export function __getActiveExecutions(): TaskExecution[] {
  return [...activeExecutions];
}

export function __fireDidStartTask(e: TaskStartEvent): void {
  didStartEmitter.fire(e);
}

export function __fireDidEndTask(e: TaskEndEvent): void {
  didEndEmitter.fire(e);
}

export function __clearTasks(): void {
  providers.length = 0;
  declaredTaskDefinitions.length = 0;
  activeExecutions.clear();
  warnedStub = false;
}

export const tasks = {
  registerTaskProvider,
  executeTask,
  fetchTasks,
  onDidStartTask,
  onDidEndTask,
  onDidStartTaskProcess,
  onDidEndTaskProcess,
  ShellExecution,
  ProcessExecution,
  CustomExecution,
} as const;

export const tasksNamespace = tasks;
