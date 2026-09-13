/**
 * Shared Types
 *
 * Common primitives such as Disposable and Event.
 */
export interface Disposable {
  dispose(): void;
}

export function toDisposable(fn: () => void): Disposable {
  let disposed = false;
  return {
    dispose(): void {
      if (!disposed) {
        disposed = true;
        fn();
      }
    },
  };
}

export function combinedDisposable(...disposables: Disposable[]): Disposable {
  return toDisposable(() => {
    for (const d of disposables) {
      try {
        d.dispose();
      } catch {
        // Ignore dispose errors.
      }
    }
  });
}

export type Event<T> = (
  listener: (e: T) => unknown,
  thisArg?: unknown,
  disposables?: Disposable[],
) => Disposable;

export class Emitter<T> {
  private listeners = new Set<(e: T) => unknown>();

  readonly event: Event<T> = (listener, thisArg, disposables) => {
    const bound = thisArg ? listener.bind(thisArg) : listener;
    const wrapped = bound as (e: T) => unknown;
    (wrapped as unknown as Record<string, unknown>).__orig = listener;
    this.listeners.add(wrapped);
    const disposable = toDisposable(() => {
      this.listeners.delete(wrapped);
    });
    if (disposables) disposables.push(disposable);
    return disposable;
  };

  fire(event: T): void {
    const snapshot = [...this.listeners];
    for (const listener of snapshot) {
      try {
        listener(event);
      } catch (err) {
        console.error('[notron-sdk] Event listener threw:', err);
      }
    }
  }

  get count(): number {
    return this.listeners.size;
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

export interface WorkspaceFolder {
  uri: string;
  name: string;
  index: number;
}

export interface ConfigurationChangeEvent {
  affectsConfiguration(section: string, scope?: string): boolean;
}

export type DocumentSelector = string | { language?: string; pattern?: string } | Array<string | { language?: string }>;

export interface Progress {
  report(value: { message?: string; increment?: number }): void;
}

export interface ProgressOptions {
  title: string;
  cancellable?: boolean;
  location?: string;
}

export interface QuickPickItem {
  id?: string;
  label: string;
  description?: string;
  detail?: string;
  picked?: boolean;
}

export interface QuickPickOptions {
  placeHolder?: string;
  canPickMany?: boolean;
  title?: string;
}

export interface InputBoxOptions {
  prompt?: string;
  placeHolder?: string;
  value?: string;
  password?: boolean;
  title?: string;
  validateInput?: (value: string) => string | null | undefined | Promise<string | null | undefined>;
}

export interface TextDocument {
  uri: string;
  fileName: string;
  languageId: string;
  getText(): string;
  lineCount: number;
}

export interface TextEditor {
  document: TextDocument;
  selection?: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export interface Tab {
  uri: string;
  label: string;
  isActive: boolean;
  isPinned?: boolean;
  isDirty?: boolean;
  viewColumn?: number;
  close(): Promise<boolean>;
  pin(pinned: boolean): void;
  move(toGroup: number, index?: number): void;
}

export interface TabGroup {
  viewColumn: number;
  isActive: boolean;
  tabs: Tab[];
  activeTab: Tab | undefined;
}

export interface StatusBarItem extends Disposable {
  alignment: 'left' | 'right';
  priority: number;
  text: string;
  tooltip?: string;
  command?: string;
  show(): void;
  hide(): void;
}

export interface OutputChannel extends Disposable {
  name: string;
  append(value: string): void;
  appendLine(value: string): void;
  clear(): void;
  show(preserveFocus?: boolean): void;
  hide(): void;
}

export interface WebviewOptions {
  enableScripts?: boolean;
  localResourceRoots?: string[];
}

export interface Webview {
  html: string;
  postMessage(message: unknown): Promise<boolean>;
  onDidReceiveMessage(handler: (msg: unknown) => void): Disposable;
}

export interface WebviewPanel extends Disposable {
  viewType: string;
  title: string;
  webview: Webview;
  reveal(viewColumn?: number, preserveFocus?: boolean): void;
  onDidDispose: Event<void>;
}

export interface CustomEditorProvider {
  resolveCustomEditor(document: { uri: string; getText(): string }, webviewPanel: WebviewPanel): void | Promise<void>;
}

export interface WebviewViewProvider {
  resolveWebviewView(webviewView: WebviewView): void | Promise<void>;
}

export interface WebviewView extends Disposable {
  viewType: string;
  webview: Webview;
  show(preserveFocus?: boolean): void;
  onDidDispose: Event<void>;
}

export interface TreeItem {
  label: string;
  collapsibleState?: 'none' | 'collapsed' | 'expanded';
  command?: string;
  iconPath?: string;
  contextValue?: string;
  tooltip?: string;
  description?: string;
}

export interface FileSystemProvider {
  readFile(uri: string): Promise<Uint8Array>;
  writeFile(uri: string, content: Uint8Array): Promise<void>;
  readDirectory(uri: string): Promise<[string, FileType][]>;
  createDirectory(uri: string): Promise<void>;
  delete(uri: string, options?: { recursive?: boolean }): Promise<void>;
  rename(oldUri: string, newUri: string): Promise<void>;
  stat?(uri: string): Promise<{ type: FileType; size: number; mtime: number }>;
}
