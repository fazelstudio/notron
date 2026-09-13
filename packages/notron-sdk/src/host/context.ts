/**
 * Extension Context
 *
 * Context supplied to extensions with state, secrets, and output.
 */
import type { Disposable } from '../api/types.js';
import type { OutputChannel } from '../api/types.js';
import { InMemoryMemento, InMemorySecretStorage, type Memento, type SecretStorage, type MementoPersistence } from './memento.js';
import { createOutputChannel } from '../api/window.js';

export interface ExtensionContextOptions {
 id: string;
 extensionPath?: string;
 extensionUri?: string;
 globalState?: Memento;
 workspaceState?: Memento;
 secrets?: SecretStorage;
 globalPersistence?: MementoPersistence;
 workspacePersistence?: MementoPersistence;
}

export class ExtensionContext {
 public readonly subscriptions: Disposable[] = [];
 public readonly extensionPath: string;
 public readonly extensionUri: string;
 public readonly globalState: Memento;
 public readonly workspaceState: Memento;
 public readonly secrets: SecretStorage;
 public readonly logChannel: OutputChannel;
 public readonly extensionId: string;

 constructor(options: string | ExtensionContextOptions) {
 if (typeof options === 'string') {
 // legacy compat: new ExtensionContext(id)
 this.extensionId = options;
 this.extensionPath = `/extensions/${options}`;
 this.extensionUri = `file://${this.extensionPath}`;
 this.globalState = new InMemoryMemento();
 this.workspaceState = new InMemoryMemento();
 this.secrets = new InMemorySecretStorage();
 this.logChannel = createOutputChannel(`Extension:${options}`);
 return;
 }
 this.extensionId = options.id;
 this.extensionPath = options.extensionPath ?? `/extensions/${options.id}`;
 this.extensionUri = options.extensionUri ?? `file://${this.extensionPath}`;
 this.globalState = options.globalState ?? new InMemoryMemento({}, options.globalPersistence);
 this.workspaceState = options.workspaceState ?? new InMemoryMemento({}, options.workspacePersistence);
 this.secrets = options.secrets ?? new InMemorySecretStorage();
 this.logChannel = createOutputChannel(`Extension:${options.id}`);
 }

 get id(): string {
 return this.extensionId;
 }

 pushDisposable(disposable: Disposable): void {
 this.subscriptions.push(disposable);
 }

 /** Legacy: workspaceState() getter that previously threw — kept for compat */
 workspaceStateLegacy(): Map<string, unknown> {
 throw new Error('ExtensionContext.workspaceState is now a Memento property, not a method. Use context.workspaceState.get/update');
 }

 globalStateLegacy(): Map<string, unknown> {
 throw new Error('ExtensionContext.globalState is now a Memento property, not a method. Use context.globalState.get/update');
 }

 /** Dispose all subscriptions in reverse order. */
 dispose(): void {
 // reverse order
 for (let i = this.subscriptions.length - 1; i >= 0; i--) {
 try {
 this.subscriptions[i]!.dispose();
 } catch (err) {
 console.error(`[ExtensionContext:${this.extensionId}] dispose error:`, err);
 }
 }
 this.subscriptions.length = 0;
 try {
 this.logChannel.dispose();
 } catch {
 // ignore
 }
 }
}
