/**
 * Workspace
 *
 * Workspace file system, configuration, and document events with in-memory fallback.
 */
import {
  type Disposable,
  type Event,
  type WorkspaceFolder,
  type ConfigurationChangeEvent,
  type FileSystemProvider,
  type TextDocument,
  FileType,
  Emitter,
} from './types.js';
import { NotImplementedError } from '../host/errors.js';

export interface ConfigurationContribution {
  title: string;
  category?: string;
  properties: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    default?: unknown;
    description?: string;
    enum?: unknown[];
  }>;
}

export interface ConfigurationContributionDelegate {
  registerConfiguration?(contribution: ConfigurationContribution, extensionId: string): Disposable;
}

let configurationContributionDelegate: ConfigurationContributionDelegate | null = null;

export function setConfigurationContributionDelegate(d: ConfigurationContributionDelegate | null): void {
  configurationContributionDelegate = d;
}

export function __registerConfigurationContribution(
  contribution: ConfigurationContribution,
  extensionId: string,
): Disposable {
  if (configurationContributionDelegate?.registerConfiguration) {
    return configurationContributionDelegate.registerConfiguration(contribution, extensionId);
  }
  return { dispose() {} };
}

/** Register a runtime configuration schema owned by an extension. */
export function registerConfiguration(
  contribution: ConfigurationContribution,
  extensionId = 'runtime',
): Disposable {
  if (!contribution?.title || !contribution.properties) {
    throw new TypeError('[workspace] registerConfiguration requires a title and properties');
  }
  return __registerConfigurationContribution(contribution, extensionId);
}

export interface WorkspaceDelegate {
  fs?: {
    readFile(uri: string): Promise<Uint8Array>;
    writeFile(uri: string, content: Uint8Array): Promise<void>;
    readDirectory(uri: string): Promise<[string, FileType][]>;
    createDirectory(uri: string): Promise<void>;
    delete(uri: string, options?: { recursive?: boolean }): Promise<void>;
    rename(oldUri: string, newUri: string): Promise<void>;
    stat?(uri: string): Promise<{ type: FileType; size: number; mtime: number }>;
  };
  getConfiguration?: (section?: string) => WorkspaceConfiguration;
  onDidChangeConfigurationEmitter?: Emitter<ConfigurationChangeEvent>;
  workspaceFolders?: WorkspaceFolder[] | undefined;
}

let workspaceDelegate: WorkspaceDelegate | null = null;

export function setWorkspaceDelegate(d: WorkspaceDelegate | null): void {
  workspaceDelegate = d;
}

export function getWorkspaceDelegate(): WorkspaceDelegate | null {
  return workspaceDelegate;
}

type FsEntry = { type: FileType; content?: Uint8Array; children?: Map<string, FsEntry> };

const fsRoot = new Map<string, FsEntry>();

function normalizePath(p: string): string {
  let n = p.replace(/\\/g, '/');
  if (!n.startsWith('/')) n = '/' + n;
  n = n.replace(/\/+/g, '/');
  if (n.length > 1 && n.endsWith('/')) n = n.slice(0, -1);
  return n;
}

function splitPath(p: string): string[] {
  const n = normalizePath(p);
  if (n === '/') return [];
  return n.slice(1).split('/');
}

function getEntry(path: string): FsEntry | undefined {
  const parts = splitPath(path);
  if (parts.length === 0) return { type: FileType.Directory, children: fsRoot };
  let cur: Map<string, FsEntry> = fsRoot;
  let entry: FsEntry | undefined;
  for (let i = 0; i < parts.length; i++) {
    entry = cur.get(parts[i]);
    if (!entry) return undefined;
    if (i === parts.length - 1) return entry;
    if (!entry.children) return undefined;
    cur = entry.children;
  }
  return entry;
}

function ensureParent(path: string): { parent: Map<string, FsEntry>; name: string } | null {
  const parts = splitPath(path);
  if (parts.length === 0) return null;
  const name = parts[parts.length - 1]!;
  let cur = fsRoot;
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i]!;
    let next = cur.get(seg);
    if (!next) {
      next = { type: FileType.Directory, children: new Map() };
      cur.set(seg, next);
    }
    if (!next.children) return null;
    cur = next.children;
  }
  return { parent: cur, name };
}

function ensureRootExists(): void {
}

const configStore = new Map<string, unknown>([
  ['theme', 'system'],
  ['font_size', 14],
  ['font_family', 'JetBrains Mono, Consolas, monospace'],
  ['tab_size', 4],
  ['word_wrap', false],
  ['line_numbers', true],
  ['auto_save', false],
]);

const configEmitter = new Emitter<ConfigurationChangeEvent>();

export interface WorkspaceConfiguration {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  has(key: string): boolean;
  update(key: string, value: unknown, target?: 'global' | 'workspace'): Promise<void>;
}

function createWorkspaceConfiguration(section?: string): WorkspaceConfiguration {
  if (workspaceDelegate?.getConfiguration) {
    return workspaceDelegate.getConfiguration(section);
  }
  const prefix = section ? section + '.' : '';
  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      const full = prefix + key;
      if (configStore.has(full)) return configStore.get(full) as T;
      if (section && configStore.has(key)) return configStore.get(key) as T;
      return defaultValue as T | undefined;
    },
    has(key: string): boolean {
      const full = prefix + key;
      return configStore.has(full) || (section ? configStore.has(key) : false);
    },
    async update(key: string, value: unknown, _target?: 'global' | 'workspace'): Promise<void> {
      const full = prefix + key;
      const affects = full;
      if (value === undefined) configStore.delete(full);
      else configStore.set(full, value);
      configEmitter.fire({
        affectsConfiguration(sectionParam: string): boolean {
          return sectionParam === key || sectionParam === full || affects.startsWith(sectionParam);
        },
      });
    },
  };
}

let workspaceFoldersStore: WorkspaceFolder[] | undefined;
const workspaceFoldersEmitter = new Emitter<WorkspaceFolder[] | undefined>();

function resolveWorkspaceFolders(): WorkspaceFolder[] | undefined {
  if (workspaceDelegate?.workspaceFolders !== undefined) return workspaceDelegate.workspaceFolders;
  return workspaceFoldersStore;
}

const didOpenEmitter = new Emitter<TextDocument>();
const didCloseEmitter = new Emitter<TextDocument>();
const didSaveEmitter = new Emitter<TextDocument>();
const didChangeEmitter = new Emitter<{ document: TextDocument; contentChanges: unknown[] }>();

const fileSystemProviders = new Map<string, FileSystemProvider>();

const fsChangeEmitter = new Emitter<{ uri: string; type: 'created' | 'changed' | 'deleted' }>();

export const fs = {
  async readFile(uri: string): Promise<Uint8Array> {
    if (workspaceDelegate?.fs?.readFile) return workspaceDelegate.fs.readFile(uri);
    const entry = getEntry(uri);
    if (!entry) throw new Error(`[workspace.fs] readFile: file not found: ${uri}`);
    if (entry.type !== FileType.File) throw new Error(`[workspace.fs] readFile: not a file: ${uri}`);
    return entry.content ?? new Uint8Array(0);
  },

  async writeFile(uri: string, content: Uint8Array): Promise<void> {
    if (workspaceDelegate?.fs?.writeFile) return workspaceDelegate.fs.writeFile(uri, content);
    ensureRootExists();
    const parentInfo = ensureParent(uri);
    if (!parentInfo) throw new Error(`[workspace.fs] writeFile: cannot write root`);
    const { parent, name } = parentInfo;
    parent.set(name, { type: FileType.File, content: new Uint8Array(content) });
    fsChangeEmitter.fire({ uri: normalizePath(uri), type: 'changed' });
  },

  async readDirectory(uri: string): Promise<[string, FileType][]> {
    if (workspaceDelegate?.fs?.readDirectory) return workspaceDelegate.fs.readDirectory(uri);
    const entry = getEntry(uri);
    if (!entry) throw new Error(`[workspace.fs] readDirectory: not found: ${uri}`);
    if (entry.type !== FileType.Directory) throw new Error(`[workspace.fs] readDirectory: not a directory: ${uri}`);
    const children = entry.children ?? (uri === '/' ? fsRoot : new Map());
    const result: [string, FileType][] = [];
    for (const [name, child] of children) result.push([name, child.type]);
    return result;
  },

  async createDirectory(uri: string): Promise<void> {
    if (workspaceDelegate?.fs?.createDirectory) return workspaceDelegate.fs.createDirectory(uri);
    const parentInfo = ensureParent(uri);
    if (!parentInfo) throw new Error(`[workspace.fs] createDirectory: cannot create root`);
    const { parent, name } = parentInfo;
    if (parent.has(name)) {
      const existing = parent.get(name)!;
      if (existing.type === FileType.Directory) return;
      throw new Error(`[workspace.fs] createDirectory: path exists and is not a directory: ${uri}`);
    }
    parent.set(name, { type: FileType.Directory, children: new Map() });
    fsChangeEmitter.fire({ uri: normalizePath(uri), type: 'created' });
  },

  async delete(uri: string, options?: { recursive?: boolean }): Promise<void> {
    if (workspaceDelegate?.fs?.delete) return workspaceDelegate.fs.delete(uri, options);
    const parentInfo = ensureParent(uri);
    if (!parentInfo) throw new Error(`[workspace.fs] delete: cannot delete root`);
    const { parent, name } = parentInfo;
    const entry = parent.get(name);
    if (!entry) throw new Error(`[workspace.fs] delete: not found: ${uri}`);
    if (entry.type === FileType.Directory && entry.children && entry.children.size > 0 && !options?.recursive) {
      throw new Error(`[workspace.fs] delete: directory not empty (use recursive:true): ${uri}`);
    }
    parent.delete(name);
    fsChangeEmitter.fire({ uri: normalizePath(uri), type: 'deleted' });
  },

  async rename(oldUri: string, newUri: string): Promise<void> {
    if (workspaceDelegate?.fs?.rename) return workspaceDelegate.fs.rename(oldUri, newUri);
    const oldParent = ensureParent(oldUri);
    const newParent = ensureParent(newUri);
    if (!oldParent || !newParent) throw new Error(`[workspace.fs] rename: cannot rename root`);
    const oldEntry = oldParent.parent.get(oldParent.name);
    if (!oldEntry) throw new Error(`[workspace.fs] rename: not found: ${oldUri}`);
    if (newParent.parent.has(newParent.name)) throw new Error(`[workspace.fs] rename: target exists: ${newUri}`);
    oldParent.parent.delete(oldParent.name);
    newParent.parent.set(newParent.name, oldEntry);
    fsChangeEmitter.fire({ uri: normalizePath(oldUri), type: 'deleted' });
    fsChangeEmitter.fire({ uri: normalizePath(newUri), type: 'created' });
  },

  async stat(uri: string): Promise<{ type: FileType; size: number; mtime: number }> {
    if (workspaceDelegate?.fs?.stat) return workspaceDelegate.fs.stat(uri);
    const entry = getEntry(uri);
    if (!entry) throw new Error(`[workspace.fs] stat: not found: ${uri}`);
    const size = entry.type === FileType.File ? (entry.content?.length ?? 0) : 0;
    return { type: entry.type, size, mtime: Date.now() };
  },
};

export function getConfiguration(section?: string): WorkspaceConfiguration {
  return createWorkspaceConfiguration(section);
}

export const onDidChangeConfiguration: Event<ConfigurationChangeEvent> = (listener, thisArg, disposables) => {
  const emitter = workspaceDelegate?.onDidChangeConfigurationEmitter ?? configEmitter;
  return emitter.event(listener as (e: ConfigurationChangeEvent) => unknown, thisArg, disposables);
};

export const onDidChangeWorkspaceFolders: Event<WorkspaceFolder[] | undefined> = workspaceFoldersEmitter.event;

export function __setWorkspaceFolders(folders: WorkspaceFolder[] | undefined): void {
  workspaceFoldersStore = folders;
  workspaceFoldersEmitter.fire(folders);
}

export function getWorkspaceFoldersPublic(): WorkspaceFolder[] | undefined {
  return resolveWorkspaceFolders();
}

export const onDidOpenTextDocument: Event<TextDocument> = didOpenEmitter.event;
export const onDidCloseTextDocument: Event<TextDocument> = didCloseEmitter.event;
export const onDidSaveTextDocument: Event<TextDocument> = didSaveEmitter.event;
export const onDidChangeTextDocument: Event<{ document: TextDocument; contentChanges: unknown[] }> =
  didChangeEmitter.event;

export function __fireDidOpen(doc: TextDocument): void {
  didOpenEmitter.fire(doc);
}
export function __fireDidClose(doc: TextDocument): void {
  didCloseEmitter.fire(doc);
}
export function __fireDidSave(doc: TextDocument): void {
  didSaveEmitter.fire(doc);
}
export function __fireDidChange(doc: TextDocument, changes: unknown[] = []): void {
  didChangeEmitter.fire({ document: doc, contentChanges: changes });
}

export const onFileSystemChange: Event<{ uri: string; type: 'created' | 'changed' | 'deleted' }> =
  fsChangeEmitter.event;

export function registerFileSystemProvider(
  _scheme: string,
  _provider: FileSystemProvider,
): Disposable {
  throw new NotImplementedError(
    'workspace.registerFileSystemProvider',
    'Virtual file system requires core support for custom scheme routing. Define types only for now.',
  );
}

export function __getFileSystemProviders(): Map<string, FileSystemProvider> {
  return fileSystemProviders;
}

export function __clearWorkspaceState(): void {
  fsRoot.clear();
  configStore.clear();
  configStore.set('theme', 'system');
  configStore.set('font_size', 14);
  configStore.set('font_family', 'JetBrains Mono, Consolas, monospace');
  configStore.set('tab_size', 4);
  configStore.set('word_wrap', false);
  configStore.set('line_numbers', true);
  configStore.set('auto_save', false);
  workspaceFoldersStore = undefined;
}

export function __getConfigStore(): Map<string, unknown> {
  return configStore;
}

export function __getFsEntries(): Map<string, FsEntry> {
  return fsRoot;
}

export const workspace = {
  fs,
  getConfiguration,
  registerConfiguration,
  onDidChangeConfiguration,
  onDidChangeWorkspaceFolders,
  get workspaceFolders(): WorkspaceFolder[] | undefined {
    return resolveWorkspaceFolders();
  },
  onDidOpenTextDocument,
  onDidCloseTextDocument,
  onDidSaveTextDocument,
  onDidChangeTextDocument,
  onFileSystemChange,
  registerFileSystemProvider,
} as const;

export const workspaceNamespace = workspace;
