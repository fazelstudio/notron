/**
 * Window
 *
 * Window UI including notifications, status bar, output, tabs, and stubs for custom editors.
 */
import {
  type Disposable,
  type QuickPickItem,
  type QuickPickOptions,
  type InputBoxOptions,
  type ProgressOptions,
  type Progress,
  type StatusBarItem,
  type OutputChannel,
  type Tab,
  type TabGroup,
  type TextEditor,
  type WebviewPanel,
  type WebviewViewProvider,
  type CustomEditorProvider,
  type WebviewOptions,
  type Event,
  Emitter,
} from './types.js';
import { NotImplementedError } from '../host/errors.js';

export interface WindowDelegate {
  showInformationMessage?(message: string, ...items: string[]): Promise<string | undefined>;
  showWarningMessage?(message: string, ...items: string[]): Promise<string | undefined>;
  showErrorMessage?(message: string, ...items: string[]): Promise<string | undefined>;
  showQuickPick?(items: string[] | QuickPickItem[], options?: QuickPickOptions): Promise<QuickPickItem | undefined>;
  showInputBox?(options?: InputBoxOptions): Promise<string | undefined>;
  withProgress?<R>(options: ProgressOptions, task: (progress: Progress) => Promise<R>): Promise<R>;
  createStatusBarItemInternal?(alignment: 'left' | 'right', priority: number, id: string): StatusBarItem;
  tabGroups?: {
    all: TabGroup[];
    activeTab: Tab | undefined;
    openTab(uri: string, options?: { viewColumn?: number; preview?: boolean }): Promise<Tab>;
  };
}

let windowDelegate: WindowDelegate | null = null;

export function setWindowDelegate(d: WindowDelegate | null): void {
  windowDelegate = d;
}

export function getWindowDelegate(): WindowDelegate | null {
  return windowDelegate;
}

type ShownMessage = { level: 'info' | 'warning' | 'error'; message: string; items: string[] };
const shownMessages: ShownMessage[] = [];

function pushShown(level: ShownMessage['level'], message: string, items: string[]): void {
  shownMessages.push({ level, message, items });
  const tag = level === 'info' ? 'ℹ' : level === 'warning' ? '⚠' : '✖';
  console.log(`[notron-sdk:window] ${tag} ${message}${items.length ? ` [${items.join(', ')}]` : ''}`);
}

let statusBarCounter = 0;
const statusBarItems = new Map<string, StatusBarItemImpl>();

class StatusBarItemImpl implements StatusBarItem {
  text = '';
  tooltip?: string;
  command?: string;
  private visible = false;
  private disposed = false;

  constructor(
    public readonly id: string,
    public readonly alignment: 'left' | 'right',
    public priority: number,
  ) {}

  show(): void {
    if (this.disposed) return;
    this.visible = true;
  }

  hide(): void {
    if (this.disposed) return;
    this.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.visible = false;
    statusBarItems.delete(this.id);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

const outputChannels = new Map<string, OutputChannelImpl>();

class OutputChannelImpl implements OutputChannel {
  private content = '';
  private visible = false;
  private disposed = false;

  constructor(public readonly name: string) {}

  append(value: string): void {
    if (this.disposed) return;
    this.content += value;
  }

  appendLine(value: string): void {
    if (this.disposed) return;
    this.content += value + '\n';
  }

  clear(): void {
    if (this.disposed) return;
    this.content = '';
  }

  show(_preserveFocus?: boolean): void {
    if (this.disposed) return;
    this.visible = true;
    console.log(`[OutputChannel:${this.name}] show`);
  }

  hide(): void {
    if (this.disposed) return;
    this.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    outputChannels.delete(this.name);
  }

  getText(): string {
    return this.content;
  }

  get isVisible(): boolean {
    return this.visible;
  }
}

const tabEmitter = new Emitter<void>();
const activeTabEmitter = new Emitter<Tab | undefined>();

let tabGroupsStore: TabGroup[] = [{ viewColumn: 1, isActive: true, tabs: [], activeTab: undefined as Tab | undefined }];
let activeTabStore: Tab | undefined;

function createTab(uri: string, viewColumn = 1): Tab {
  const label = uri.split('/').pop() ?? uri;
  const tab: Tab = {
    uri,
    label,
    isActive: false,
    isPinned: false,
    isDirty: false,
    viewColumn,
    async close(): Promise<boolean> {
      for (const g of tabGroupsStore) {
        const idx = g.tabs.indexOf(tab);
        if (idx !== -1) {
          g.tabs.splice(idx, 1);
          if (g.activeTab === tab) g.activeTab = g.tabs[g.tabs.length - 1];
          if (activeTabStore === tab) {
            activeTabStore = g.activeTab;
            activeTabEmitter.fire(activeTabStore);
          }
          tabEmitter.fire();
          return true;
        }
      }
      return false;
    },
    pin(pinned: boolean): void {
      tab.isPinned = pinned;
      tabEmitter.fire();
    },
    move(toGroup: number, index?: number): void {
      let currentGroup: TabGroup | undefined;
      for (const g of tabGroupsStore) {
        const idx = g.tabs.indexOf(tab);
        if (idx !== -1) {
          currentGroup = g;
          g.tabs.splice(idx, 1);
          if (g.activeTab === tab) g.activeTab = g.tabs[g.tabs.length - 1];
          break;
        }
      }
      void currentGroup;
      let target = tabGroupsStore.find((g) => g.viewColumn === toGroup);
      if (!target) {
        target = { viewColumn: toGroup, isActive: false, tabs: [], activeTab: undefined };
        tabGroupsStore.push(target);
      }
      if (index !== undefined && index >= 0 && index <= target.tabs.length) {
        target.tabs.splice(index, 0, tab);
      } else {
        target.tabs.push(tab);
      }
      tab.viewColumn = toGroup;
      tabEmitter.fire();
    },
  };
  return tab;
}

const activeEditorEmitter = new Emitter<TextEditor | undefined>();
let activeTextEditorStore: TextEditor | undefined;
let visibleEditorsStore: TextEditor[] = [];

const customEditorProviders = new Map<string, CustomEditorProvider>();
const webviewViewProviders = new Map<string, WebviewViewProvider>();

export async function showInformationMessage(
  message: string,
  ...items: string[]
): Promise<string | undefined> {
  if (windowDelegate?.showInformationMessage) {
    return windowDelegate.showInformationMessage(message, ...items);
  }
  pushShown('info', message, items);
  return undefined;
}

export async function showWarningMessage(
  message: string,
  ...items: string[]
): Promise<string | undefined> {
  if (windowDelegate?.showWarningMessage) {
    return windowDelegate.showWarningMessage(message, ...items);
  }
  pushShown('warning', message, items);
  return undefined;
}

export async function showErrorMessage(
  message: string,
  ...items: string[]
): Promise<string | undefined> {
  if (windowDelegate?.showErrorMessage) {
    return windowDelegate.showErrorMessage(message, ...items);
  }
  pushShown('error', message, items);
  return undefined;
}

export async function showQuickPick(
  items: string[] | QuickPickItem[],
  options?: QuickPickOptions,
): Promise<QuickPickItem | undefined> {
  void options;
  if (windowDelegate?.showQuickPick) {
    return windowDelegate.showQuickPick(items, options);
  }
  const normalized: QuickPickItem[] = (items as unknown[]).map((it) =>
    typeof it === 'string' ? { label: it } : (it as QuickPickItem),
  );
  void normalized;
  return undefined;
}

export async function showInputBox(options?: InputBoxOptions): Promise<string | undefined> {
  if (windowDelegate?.showInputBox) {
    return windowDelegate.showInputBox(options);
  }
  void options;
  return undefined;
}

export async function withProgress<R>(
  options: ProgressOptions,
  task: (progress: Progress) => Promise<R>,
): Promise<R> {
  if (windowDelegate?.withProgress) {
    return windowDelegate.withProgress(options, task);
  }
  const progress: Progress = { report: () => {} };
  console.log(`[notron-sdk:window] withProgress: ${options.title}`);
  return task(progress);
}

export function createStatusBarItem(
  alignment: 'left' | 'right' = 'left',
  priority = 0,
): StatusBarItem {
  const id = `notron-sdk-status-${++statusBarCounter}`;
  if (windowDelegate?.createStatusBarItemInternal) {
    const real = windowDelegate.createStatusBarItemInternal(alignment, priority, id);
    return real;
  }
  const item = new StatusBarItemImpl(id, alignment, priority);
  statusBarItems.set(id, item);
  return item;
}

export function createOutputChannel(name: string): OutputChannel {
  if (!name || !name.trim()) throw new TypeError('[window] createOutputChannel: name must be non-empty string');
  const existing = outputChannels.get(name);
  if (existing) return existing;
  const ch = new OutputChannelImpl(name);
  outputChannels.set(name, ch);
  return ch;
}

export const tabGroups = {
  get all(): TabGroup[] {
    if (windowDelegate?.tabGroups) return windowDelegate.tabGroups.all;
    return tabGroupsStore;
  },
  get activeTab(): Tab | undefined {
    if (windowDelegate?.tabGroups) return windowDelegate.tabGroups.activeTab;
    return activeTabStore;
  },
  async openTab(uri: string, options?: { viewColumn?: number; preview?: boolean }): Promise<Tab> {
    void options?.preview;
    if (windowDelegate?.tabGroups) {
      return windowDelegate.tabGroups.openTab(uri, options);
    }
    const viewColumn = options?.viewColumn ?? 1;
    const tab = createTab(uri, viewColumn);
    let group = tabGroupsStore.find((g) => g.viewColumn === viewColumn);
    if (!group) {
      group = { viewColumn, isActive: true, tabs: [], activeTab: undefined };
      tabGroupsStore.push(group);
    }
    for (const g of tabGroupsStore) g.isActive = g === group;
    for (const g of tabGroupsStore) for (const t of g.tabs) t.isActive = false;
    tab.isActive = true;
    group.tabs.push(tab);
    group.activeTab = tab;
    activeTabStore = tab;
    activeTextEditorStore = { document: { uri, fileName: labelFromUri(uri), languageId: 'plaintext', getText: () => '', lineCount: 1 } };
    visibleEditorsStore = [activeTextEditorStore];
    activeEditorEmitter.fire(activeTextEditorStore);
    activeTabEmitter.fire(tab);
    tabEmitter.fire();
    return tab;
  },
  get onDidChangeTabGroups(): Event<void> {
    return tabEmitter.event;
  },
  get onDidChangeActiveTab(): Event<Tab | undefined> {
    return activeTabEmitter.event;
  },
};

function labelFromUri(uri: string): string {
  return uri.split('/').pop()?.split('\\').pop() ?? uri;
}

export function __setActiveTab(tab: Tab | undefined): void {
  activeTabStore = tab;
  activeTabEmitter.fire(tab);
}

export function __setTabGroups(groups: TabGroup[]): void {
  tabGroupsStore = groups;
  tabEmitter.fire();
}

export function getActiveTextEditor(): TextEditor | undefined {
  return activeTextEditorStore;
}

export function getVisibleTextEditors(): TextEditor[] {
  return [...visibleEditorsStore];
}

export const onDidChangeActiveTextEditor: Event<TextEditor | undefined> = activeEditorEmitter.event;

export function __setActiveTextEditor(editor: TextEditor | undefined): void {
  activeTextEditorStore = editor;
  if (editor && !visibleEditorsStore.includes(editor)) visibleEditorsStore = [editor, ...visibleEditorsStore.filter((e) => e !== editor)];
  activeEditorEmitter.fire(editor);
}

export function __setVisibleTextEditors(editors: TextEditor[]): void {
  visibleEditorsStore = [...editors];
}

export function registerCustomEditorProvider(
  _viewType: string,
  _provider: CustomEditorProvider,
  _options?: { supportsMultipleEditorsPerDocument?: boolean },
): Disposable {
  throw new NotImplementedError('window.registerCustomEditorProvider', 'Notron core does not yet expose a generic custom editor registry. Use previewRegistry for markdown/svg as interim.');
}

export async function openEditorToSide(_uri: string, _viewType?: string): Promise<void> {
  throw new NotImplementedError('window.openEditorToSide', 'SplitView exists but no custom viewType routing yet.');
}

export function createWebviewPanel(
  _viewType: string,
  _title: string,
  _showOptions: { viewColumn: number },
  _options?: WebviewOptions,
): WebviewPanel {
  throw new NotImplementedError('window.createWebviewPanel', 'Webview panel requires core webview host (CSP isolation).');
}

export function registerWebviewViewProvider(
  _viewId: string,
  _provider: WebviewViewProvider,
): Disposable {
  throw new NotImplementedError('window.registerWebviewViewProvider', 'Sidebar WebviewView host not yet wired. See views registry gap.');
}

export function __getCustomEditorProviders(): Map<string, CustomEditorProvider> {
  return customEditorProviders;
}
export function __getWebviewViewProviders(): Map<string, WebviewViewProvider> {
  return webviewViewProviders;
}

export function __getShownMessages(): ShownMessage[] {
  return [...shownMessages];
}

export function __clearShownMessages(): void {
  shownMessages.length = 0;
}

export function __getStatusBarItems(): StatusBarItemImpl[] {
  return [...statusBarItems.values()];
}

export function __getOutputChannels(): Map<string, OutputChannelImpl> {
  return outputChannels;
}

export function __getOutputChannelText(name: string): string | undefined {
  return (outputChannels.get(name) as OutputChannelImpl | undefined)?.getText();
}

export function __clearWindowState(): void {
  shownMessages.length = 0;
  for (const item of [...statusBarItems.values()]) item.dispose();
  statusBarItems.clear();
  statusBarCounter = 0;
  for (const ch of [...outputChannels.values()]) ch.dispose();
  outputChannels.clear();
  tabGroupsStore = [{ viewColumn: 1, isActive: true, tabs: [], activeTab: undefined }];
  activeTabStore = undefined;
  activeTextEditorStore = undefined;
  visibleEditorsStore = [];
  customEditorProviders.clear();
  webviewViewProviders.clear();
}

export const window = {
  showInformationMessage,
  showWarningMessage,
  showErrorMessage,
  showQuickPick,
  showInputBox,
  withProgress,
  createStatusBarItem,
  createOutputChannel,
  tabGroups,
  get activeTextEditor(): TextEditor | undefined {
    return getActiveTextEditor();
  },
  get visibleTextEditors(): TextEditor[] {
    return getVisibleTextEditors();
  },
  onDidChangeActiveTextEditor,
  registerCustomEditorProvider,
  openEditorToSide,
  createWebviewPanel,
  registerWebviewViewProvider,
} as const;

export const windowNamespace = window;
