/**
 * Event Bus
 *
 * Central event hub for host and extensions.
 */
import { Emitter, type Event, type Disposable } from '../api/types.js';
import { ExtensionRuntimeError } from './errors.js';

export type EventPayload = unknown;

export class NotronEventBus {
 private emitters = new Map<string, Emitter<unknown>>();
 private globalLog?: (err: ExtensionRuntimeError) => void;

 constructor(log?: (err: ExtensionRuntimeError) => void) {
 this.globalLog = log;
 }

 /** Emit an event to all listeners with per-listener try/catch. */
 emit(event: string, payload: unknown): void {
 const emitter = this.emitters.get(event);
 if (!emitter) return;
 // Emitter already has per-listener try/catch, but we also wrap fire itself
 try {
 emitter.fire(payload);
 } catch (err) {
 const wrapped = new ExtensionRuntimeError('host', `emit:${event}`, err);
 if (this.globalLog) this.globalLog(wrapped);
 else console.error(wrapped.message, err);
 }
 }

 /** Subscribe to an event. Returns Disposable. */
 on(event: string, handler: (payload: unknown) => void): Disposable {
 let emitter = this.emitters.get(event);
 if (!emitter) {
 emitter = new Emitter<unknown>();
 this.emitters.set(event, emitter);
 }
 // wrap handler with extension-aware isolation if handler carries extension metadata
 // For now generic isolation is inside Emitter.fire; host lifecycle will wrap per-extension handlers separately.
 return emitter.event(handler as (e: unknown) => unknown) as Disposable;
 }

 /** Subscribe to a typed event, returns Disposable via Event<T>. */
 onTyped<T>(event: string): Event<T> {
 return (listener: (e: T) => unknown, thisArg?: unknown, disposables?: Disposable[]) => {
 const bound = thisArg ? listener.bind(thisArg) : listener;
 const disposable = this.on(event, bound as (p: unknown) => void);
 if (disposables) disposables.push(disposable);
 return disposable;
 };
 }

 /** Remove all listeners for an event (for teardown). */
 clear(event?: string): void {
 if (event) {
 const e = this.emitters.get(event);
 if (e) {
 e.dispose();
 this.emitters.delete(event);
 }
 } else {
 for (const e of this.emitters.values()) e.dispose();
 this.emitters.clear();
 }
 }

 /** Count listeners for introspection/tests. */
 count(event: string): number {
 return this.emitters.get(event)?.count ?? 0;
 }

 /** Expose internal emitter for advanced bridging (e.g., direct fire from Tauri listen). */
 getEmitter(event: string): Emitter<unknown> | undefined {
 return this.emitters.get(event);
 }

 /** Set global error logger after construction. */
 setLogger(log: (err: ExtensionRuntimeError) => void): void {
 this.globalLog = log;
 }

 dispose(): void {
 this.clear();
 }
}

/** Singleton for the host process — also useful for mock host in tests. */
export function createEventBus(log?: (err: ExtensionRuntimeError) => void): NotronEventBus {
 return new NotronEventBus(log);
}

/** Well-known SDK event names. */
export const SDK_EVENTS = {
 DID_OPEN_TEXT_DOCUMENT: 'onDidOpenTextDocument',
 DID_CLOSE_TEXT_DOCUMENT: 'onDidCloseTextDocument',
 DID_SAVE_TEXT_DOCUMENT: 'onDidSaveTextDocument',
 DID_CHANGE_TEXT_DOCUMENT: 'onDidChangeTextDocument',
 DID_CHANGE_ACTIVE_EDITOR: 'onDidChangeActiveTextEditor',
 DID_CHANGE_SELECTION: 'onDidChangeTextEditorSelection',
 DID_CHANGE_WORKSPACE_FOLDERS: 'onDidChangeWorkspaceFolders',
 DID_CHANGE_CONFIGURATION: 'onDidChangeConfiguration',
 DID_CHANGE_COLOR_THEME: 'onDidChangeActiveColorTheme',
 DID_CHANGE_ACTIVE_TAB: 'onDidChangeActiveTab',
 DID_CHANGE_TAB_GROUPS: 'onDidChangeTabGroups',
 DID_CHANGE_VISIBLE_EDITORS: 'onDidChangeVisibleTextEditors',
 DID_CHANGE_FS: 'onFileSystemChange',
 DID_CHANGE_GIT_DECORATIONS: 'onDidChangeGitDecorations',
 DID_CHANGE_GIT_STATE: 'onDidChangeGitState',
 DID_OPEN_TERMINAL: 'onDidOpenTerminal',
 DID_CLOSE_TERMINAL: 'onDidCloseTerminal',
 DID_CHANGE: 'onDidChange',
} as const;

/** Bridge helper: subscribe to Tauri `listen` / window EventTarget and re-emit via bus. */
export function bridgeExternalEvent(
 bus: NotronEventBus,
 sdkEvent: string,
 subscribe: (handler: (payload: unknown) => void) => Disposable,
): Disposable {
 return subscribe((payload) => bus.emit(sdkEvent, payload));
}

/** Utility: wrap a Disposable-returning subscribe call so it can be added to context.subscriptions. */
export function toEvent<T>(bus: NotronEventBus, eventName: string): Event<T> {
 return (listener, thisArg, disposables) => {
 const bound = thisArg ? listener.bind(thisArg) : listener;
 const d = bus.on(eventName, bound as (p: unknown) => void);
 if (disposables) disposables.push(d);
 return d;
 };
}
