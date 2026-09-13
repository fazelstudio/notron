/**
 * Memento
 *
 * Simple key-value storage for extension state and secrets.
 */
import type { Disposable } from '../api/types.js';

/** Storage for extension state. */
export interface Memento {
 get<T>(key: string, defaultValue?: T): T | undefined;
 get<T>(key: string, defaultValue: T): T;
 update(key: string, value: unknown): Promise<void>;
 keys(): readonly string[];
}

/** Storage for secrets. */
export interface SecretStorage {
 get(key: string): Promise<string | undefined>;
 store(key: string, value: string): Promise<void>;
 delete(key: string): Promise<void>;
 onDidChange?: unknown;
}

export interface MementoPersistence {
 load(): Record<string, unknown> | Promise<Record<string, unknown>>;
 save(data: Record<string, unknown>): Promise<void>;
}

export class InMemoryMemento implements Memento {
 private data: Record<string, unknown>;

 constructor(
 initial: Record<string, unknown> = {},
 private persistence?: MementoPersistence,
 ) {
 this.data = { ...initial };
 }

 /** Load from persistence if available — call once at construction when needed. */
 async restore(): Promise<void> {
 if (!this.persistence) return;
 try {
 const loaded = await this.persistence.load();
 if (loaded && typeof loaded === 'object') this.data = { ...loaded };
 } catch (err) {
 console.warn('[notron-sdk] Memento restore failed:', err);
 }
 }

 get<T>(key: string, defaultValue?: T): T | undefined {
 if (key in this.data) return this.data[key] as T;
 return defaultValue;
 }

 async update(key: string, value: unknown): Promise<void> {
 if (value === undefined) {
 delete this.data[key];
 } else {
 this.data[key] = value;
 }
 if (this.persistence) {
 try {
 await this.persistence.save({ ...this.data });
 } catch (err) {
 console.warn('[notron-sdk] Memento save failed:', err);
 }
 }
 }

 keys(): readonly string[] {
 return Object.keys(this.data);
 }

 /** Expose raw for testing/debugging. */
 __raw(): Record<string, unknown> {
 return { ...this.data };
 }
}

/** In-memory secret storage that warns when used. */
export class InMemorySecretStorage implements SecretStorage {
 private store_ = new Map<string, string>();
 private warned = false;

 private warnOnce(): void {
 if (this.warned) return;
 this.warned = true;
 console.warn(
 '[notron-sdk] SecretStorage is using in-memory fallback (not encrypted). ' +
 'Do not use for highly sensitive data. Encrypted storage is a future core integration.',
 );
 }

 async get(key: string): Promise<string | undefined> {
 this.warnOnce();
 return this.store_.get(key);
 }

 async store(key: string, value: string): Promise<void> {
 this.warnOnce();
 this.store_.set(key, value);
 }

 async delete(key: string): Promise<void> {
 this.warnOnce();
 this.store_.delete(key);
 }
}

/** Create a file-backed persistence adapter (best-effort, no-op if FS unavailable). */
export function createFileMementoPersistence(
 filePath: string,
 fs?: { readFile(p: string): Promise<string>; writeFile(p: string, c: string): Promise<void> },
): MementoPersistence {
 return {
 async load(): Promise<Record<string, unknown>> {
 if (!fs) return {};
 try {
 const raw = await fs.readFile(filePath);
 return JSON.parse(raw) as Record<string, unknown>;
 } catch {
 return {};
 }
 },
 async save(data: Record<string, unknown>): Promise<void> {
 if (!fs) return;
 await fs.writeFile(filePath, JSON.stringify(data, null, 2));
 },
 };
}

/** No-op disposable for Memento helpers. */
export function mementoDisposable(_m: Memento): Disposable {
 return { dispose(): void {} };
}
