/**
 * Terminal
 *
 * Terminal management with in-memory fallback and host delegation.
 */
import type { Disposable, Event } from './types.js';
import { Emitter, toDisposable } from './types.js';

export interface TerminalOptions {
  name?: string;
  shellPath?: string;
  shellArgs?: string[];
  cwd?: string;
  env?: Record<string, string>;
  message?: string;
  iconPath?: string;
  color?: string;
  hideFromUser?: boolean;
}

export interface Terminal {
  readonly name: string;
  readonly processId: Promise<number | undefined>;
  readonly creationOptions: Readonly<TerminalOptions>;
  readonly exitStatus: { code: number | undefined } | undefined;

  sendText(text: string, addNewLine?: boolean): void;
  show(preserveFocus?: boolean): void;
  hide(): void;
  dispose(): void;
}

export interface TerminalProfile {
  options: TerminalOptions;
}

export interface TerminalProfileProvider {
  provideTerminalProfile(token?: unknown): Promise<TerminalProfile | undefined | null> | TerminalProfile | undefined | null;
}

export interface TerminalLink {
  startIndex: number;
  length: number;
  tooltip?: string;
  handle(): Promise<void> | void;
}

export interface TerminalLinkContext {
  line: string;
  terminal: Terminal;
}

export interface TerminalLinkProvider {
  provideTerminalLinks(context: TerminalLinkContext, token?: unknown): Promise<TerminalLink[] | undefined | null> | TerminalLink[] | undefined | null;
  handleTerminalLink(link: TerminalLink): Promise<void> | void;
}

export interface TerminalDelegate {
  createTerminalInternal?(options: TerminalOptions): Terminal;
  getTerminals?(): Terminal[];
  onDidOpenTerminal?: Event<Terminal>;
  onDidCloseTerminal?: Event<Terminal>;
  registerTerminalProfileProviderInternal?(id: string, provider: TerminalProfileProvider): Disposable;
  registerTerminalLinkProviderInternal?(provider: TerminalLinkProvider): Disposable;
}

let terminalDelegate: TerminalDelegate | null = null;

export function setTerminalDelegate(d: TerminalDelegate | null): void {
  terminalDelegate = d;
}

export function getTerminalDelegate(): TerminalDelegate | null {
  return terminalDelegate;
}

const terminals = new Map<string, TerminalImpl>();
const profileProviders = new Map<string, TerminalProfileProvider>();
const linkProviders: TerminalLinkProvider[] = [];

const didOpenEmitter = new Emitter<Terminal>();
const didCloseEmitter = new Emitter<Terminal>();

let terminalCounter = 0;

class TerminalImpl implements Terminal {
  readonly creationOptions: Readonly<TerminalOptions>;
  readonly name: string;
  private buffer = '';
  private disposed = false;
  private visible = false;
  private _exitStatus: { code: number | undefined } | undefined;
  private _processId: number | undefined;

  constructor(
    public readonly id: string,
    options: TerminalOptions,
  ) {
    this.creationOptions = Object.freeze({ ...options });
    this.name = options.name ?? `Terminal ${terminalCounter}`;
    this._processId = 1000 + terminalCounter;
  }

  get processId(): Promise<number | undefined> {
    return Promise.resolve(this._processId);
  }

  get exitStatus(): { code: number | undefined } | undefined {
    return this._exitStatus;
  }

  sendText(text: string, addNewLine = true): void {
    if (this.disposed) return;
    const chunk = addNewLine ? text + '\r\n' : text;
    this.buffer += chunk;
    console.log(`[terminal:${this.name}] sendText: ${JSON.stringify(chunk)}`);
  }

  show(_preserveFocus?: boolean): void {
    if (this.disposed) return;
    this.visible = true;
    console.log(`[terminal:${this.name}] show`);
  }

  hide(): void {
    if (this.disposed) return;
    this.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    terminals.delete(this.id);
    this._exitStatus = { code: undefined };
    didCloseEmitter.fire(this as unknown as Terminal);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  getTextBuffer(): string {
    return this.buffer;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

export function createTerminal(options: TerminalOptions = {}): Terminal {
  if (options.env !== undefined && (typeof options.env !== 'object' || Array.isArray(options.env))) {
    throw new TypeError('[terminal] env must be Record<string,string> if provided');
  }
  if (terminalDelegate?.createTerminalInternal) {
    return terminalDelegate.createTerminalInternal(options);
  }
  const id = `term-${++terminalCounter}-${Date.now()}`;
  const term = new TerminalImpl(id, options);
  terminals.set(id, term);
  didOpenEmitter.fire(term as unknown as Terminal);
  return term as unknown as Terminal;
}

export function registerTerminalProfileProvider(id: string, provider: TerminalProfileProvider): Disposable {
  if (!id || !id.trim()) throw new TypeError('[terminal] id must be non-empty string');
  if (!provider || typeof provider.provideTerminalProfile !== 'function') {
    throw new TypeError('[terminal] provider must implement provideTerminalProfile');
  }
  if (terminalDelegate?.registerTerminalProfileProviderInternal) {
    return terminalDelegate.registerTerminalProfileProviderInternal(id, provider);
  }
  if (profileProviders.has(id)) console.warn(`[terminal] overwriting profile provider "${id}"`);
  profileProviders.set(id, provider);
  return toDisposable(() => {
    if (profileProviders.get(id) === provider) profileProviders.delete(id);
  });
}

export function registerTerminalLinkProvider(provider: TerminalLinkProvider): Disposable {
  if (!provider || typeof provider.provideTerminalLinks !== 'function') {
    throw new TypeError('[terminal] provider must implement provideTerminalLinks');
  }
  if (terminalDelegate?.registerTerminalLinkProviderInternal) {
    return terminalDelegate.registerTerminalLinkProviderInternal(provider);
  }
  linkProviders.push(provider);
  return toDisposable(() => {
    const idx = linkProviders.indexOf(provider);
    if (idx !== -1) linkProviders.splice(idx, 1);
  });
}

export const onDidOpenTerminal: Event<Terminal> = (listener, thisArg, disposables) => {
  if (terminalDelegate?.onDidOpenTerminal) return terminalDelegate.onDidOpenTerminal(listener as (e: Terminal) => unknown, thisArg, disposables);
  return didOpenEmitter.event(listener as (e: Terminal) => unknown, thisArg, disposables);
};

export const onDidCloseTerminal: Event<Terminal> = (listener, thisArg, disposables) => {
  if (terminalDelegate?.onDidCloseTerminal) return terminalDelegate.onDidCloseTerminal(listener as (e: Terminal) => unknown, thisArg, disposables);
  return didCloseEmitter.event(listener as (e: Terminal) => unknown, thisArg, disposables);
};

export function __getTerminals(): Map<string, TerminalImpl> {
  return terminals;
}

export function __getProfileProviders(): Map<string, TerminalProfileProvider> {
  return profileProviders;
}

export function __getLinkProviders(): TerminalLinkProvider[] {
  return [...linkProviders];
}

export function __clearTerminal(): void {
  for (const t of [...terminals.values()]) t.dispose();
  terminals.clear();
  profileProviders.clear();
  linkProviders.length = 0;
  terminalCounter = 0;
}

export const terminal = {
  createTerminal,
  registerTerminalProfileProvider,
  registerTerminalLinkProvider,
  onDidOpenTerminal,
  onDidCloseTerminal,
} as const;

export const terminalNamespace = terminal;
