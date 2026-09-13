/**
 * SDK Types
 *
 * Public type definitions for extensions.
 */

// Core primitives

export type CommandId = string;
export type ViewId = string;
export type StatusBarAlignment = 'left' | 'right';

export interface Disposable {
  dispose(): void;
}

export interface CommandDescriptor {
  command: CommandId;
  title: string;
  category?: string;
  when?: string;
}

export interface KeybindingDescriptor {
  command: CommandId;
  key: string;
  mac?: string;
  when?: string;
}

// Contributions (mirrors package.json `contributes`)

export interface ViewContribution {
  id: ViewId;
  name: string;
  when?: string;
  icon?: string;
}

export interface MenuContribution {
  command: CommandId;
  group?: string;
  when?: string;
  alt?: CommandId;
}

export interface StatusBarItemContribution {
  id: string;
  name: string;
  alignment: StatusBarAlignment;
  priority: number;
  text: string;
  tooltip?: string;
  command?: CommandId;
  when?: string;
}

export interface ConfigurationContribution {
  id: string;
  title: string;
  properties: Record<string, ConfigurationProperty>;
}

export interface ConfigurationProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default: unknown;
  description: string;
  enum?: unknown[];
  scope?: 'application' | 'window' | 'resource';
}

// Editor

export interface LanguageContribution {
  id: string;
  extensions: string[];
  aliases?: string[];
  configuration?: string;
}

export interface ThemeContribution {
  id: string;
  label: string;
  uiTheme: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light';
  path: string;
}

// SDK API surface (what an extension imports as `import * as notron from 'notron-sdk'`)

export interface CommandsAPI {
  registerCommand(id: CommandId, callback: (...args: unknown[]) => unknown): Disposable;
  executeCommand<T>(id: CommandId, ...args: unknown[]): Promise<T | undefined>;
  getCommands(): Promise<CommandId[]>;
}

export interface WindowAPI {
  createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem;
  showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
  createOutputChannel(name: string): OutputChannel;
  registerTreeDataProvider<T>(viewId: ViewId, provider: TreeDataProvider<T>): Disposable;
}

export interface WorkspaceAPI {
  getConfiguration(section?: string): WorkspaceConfiguration;
  onDidChangeConfiguration(listener: (e: ConfigurationChangeEvent) => void): Disposable;
  fs: FileSystem;
}

export interface LanguagesAPI {
  registerLanguageProvider(language: string, provider: unknown): Disposable;
}

export interface NotronSDK {
  commands: CommandsAPI;
  window: WindowAPI;
  workspace: WorkspaceAPI;
  languages: LanguagesAPI;
}

// Minimal supporting interfaces

export interface StatusBarItem extends Disposable {
  alignment: StatusBarAlignment;
  priority: number;
  text: string;
  tooltip?: string;
  command?: CommandId;
  show(): void;
  hide(): void;
}

export interface OutputChannel extends Disposable {
  name: string;
  append(value: string): void;
  appendLine(value: string): void;
  show(): void;
  hide(): void;
  clear(): void;
}

export interface TreeDataProvider<T> {
  onDidChangeTreeData?: unknown;
  getTreeItem(element: T): unknown;
  getChildren(element?: T): Promise<T[]>;
}

export interface WorkspaceConfiguration {
  get<T>(section: string): T | undefined;
  get<T>(section: string, defaultValue: T): T;
  has(section: string): boolean;
  update(section: string, value: unknown, scope?: string): Promise<void>;
}

export interface ConfigurationChangeEvent {
  affectsConfiguration(section: string): boolean;
}

export interface FileSystem {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: Uint8Array): Promise<void>;
  stat(path: string): Promise<unknown>;
  readDirectory(path: string): Promise<[string, number][]>;
  createDirectory(path: string): Promise<void>;
  delete(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
}

// Activation

export type ExtensionContext = {
  subscriptions: Disposable[];
  extensionPath: string;
  globalState: unknown;
  workspaceState: unknown;
};

export type ExtensionActivation = (context: ExtensionContext) => void | Promise<void>;