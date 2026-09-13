/**
 * Lifecycle
 *
 * Extension lifecycle and dependency resolution.
 */
import type { ExtensionManifest } from '../types/index.js';
import { ExtensionContext } from './context.js';
import { NotronEventBus } from './eventBus.js';
import { ExtensionActivationError, ExtensionRuntimeError } from './errors.js';
import { createOutputChannel } from '../api/window.js';
import type { OutputChannel } from '../api/types.js';
import type { Memento } from './memento.js';
import type { Disposable } from '../api/types.js';
import { registerManifestContributions } from './contributions.js';


export interface ExtensionModule {
 activate(context: ExtensionContext): void | Promise<void> | unknown;
 deactivate?(): void | Promise<void>;
}

export interface ResolvedExtension {
 manifest: ExtensionManifest;
 module: ExtensionModule;
 context: ExtensionContext;
 exports?: unknown;
 activated: boolean;
 activationError?: Error;
}


export interface SortResult {
 order: string[];
 circular: string[][];
 missing: Array<{ id: string; dep: string }>;
}

export function topologicalSort(manifests: ExtensionManifest[]): SortResult {
 const idToManifest = new Map<string, ExtensionManifest>();
 for (const m of manifests) idToManifest.set(m.id, m);

 const visited = new Map<string, 'unvisited' | 'visiting' | 'visited'>();
 const order: string[] = [];
 const circular: string[][] = [];
 const missing: Array<{ id: string; dep: string }> = [];
 const stack: string[] = [];

 for (const m of manifests) visited.set(m.id, 'unvisited');

 function dfs(id: string): void {
 const state = visited.get(id);
 if (state === 'visited') return;
 if (state === 'visiting') {
 // cycle detected — extract cycle from stack
 const idx = stack.indexOf(id);
 const cycle = idx !== -1 ? [...stack.slice(idx), id] : [id];
 circular.push(cycle);
 return;
 }
 visited.set(id, 'visiting');
 stack.push(id);
 const manifest = idToManifest.get(id);
 const deps = manifest?.extensionDependencies ?? [];
 for (const dep of deps) {
 if (!idToManifest.has(dep)) {
 missing.push({ id, dep });
 continue;
 }
 dfs(dep);
 }
 stack.pop();
 visited.set(id, 'visited');
 if (!circular.some((c) => c.includes(id))) {
 order.push(id);
 }
 }

 for (const m of manifests) {
 if (visited.get(m.id) === 'unvisited') dfs(m.id);
 }

 return { order, circular, missing };
}


export function isCompatible(manifest: ExtensionManifest, hostVersion: string): boolean {
 const range = manifest.engines?.notron?.trim() ?? '*';
 if (range === '*' || range === '') return true;
 // Check semver range, supports ^, ~, >=, >, exact
 // For SDK Host we do lenient check — parse hostVersion as semver and test
 // If we cannot parse, assume compatible (host will warn separately)
 try {
 return satisfiesRange(hostVersion, range);
 } catch {
 return true;
 }
}

function parseSemver(v: string): [number, number, number] | null {
 const m = v.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
 if (!m) return null;
 return [parseInt(m[1]!, 10), parseInt(m[2]!, 10), parseInt(m[3]!, 10)];
}

function compareSemver(a: [number, number, number], b: [number, number, number]): number {
 for (let i = 0; i < 3; i++) {
 if (a[i]! !== b[i]!) return a[i]! - b[i]!;
 }
 return 0;
}

function satisfiesRange(version: string, range: string): boolean {
 const v = parseSemver(version);
 if (!v) return true;
 const trimmed = range.trim();
 if (trimmed === '*' || trimmed === '') return true;
 // handle ">=0.3.0 <1.0.0" or "^0.3.0" etc — split by space and ||
 const parts = trimmed.split(/\s*\|\|\s*|\s+/).filter(Boolean);
 // For simplicity, all parts must be satisfied (AND). Real semver OR is rarely used for host.
 for (const part of parts) {
 if (part.startsWith('^')) {
 const base = parseSemver(part.slice(1));
 if (!base) continue;
 // ^0.3.0 => >=0.3.0 <0.4.0 ; ^1.2.3 => >=1.2.3 <2.0.0 ; etc.
 if (compareSemver(v, base) < 0) return false;
 // upper bound
 if (base[0] === 0) {
 if (base[1] === 0) {
 // ^0.0.x => <0.0.(x+1)
 if (v[0] !== 0 || v[1] !== 0 || v[2] > base[2]) {
 // Actually need <0.0.(x+1) => v[2] must be == base[2] ?
 // Simplify: ^0.0.3 => >=0.0.3 <0.0.4
 if (v[0] !== 0 || v[1] !== 0) return false;
 if (v[2] > base[2]) return false;
 // if v is 0.0.4+ it's not satisfied — we check < next patch
 // For ^0.0.3, next is 0.0.4, so v must be <0.0.4 => if v[2] >=4 fail? but semver ^0.0.x is exact patch
 // We'll implement strictly: major 0, minor 0 => patch must equal
 if (v[2] !== base[2]) return false;
 }
 } else {
 // ^0.3.0 => <0.4.0
 if (v[0] !== 0 || v[1] !== base[1]) {
 if (v[0] !== 0) return false;
 if (v[1] > base[1]) return false;
 }
 }
 } else {
 if (v[0] !== base[0]) return false;
 if (compareSemver(v, base) < 0) return false;
 }
 } else if (part.startsWith('~')) {
 const base = parseSemver(part.slice(1));
 if (!base) continue;
 if (v[0] !== base[0] || v[1] !== base[1]) return false;
 if (compareSemver(v, base) < 0) return false;
 } else if (part.startsWith('>=')) {
 const base = parseSemver(part.slice(2));
 if (!base) continue;
 if (compareSemver(v, base) < 0) return false;
 } else if (part.startsWith('>')) {
 const base = parseSemver(part.slice(1));
 if (!base) continue;
 if (compareSemver(v, base) <= 0) return false;
 } else if (part.startsWith('<=')) {
 const base = parseSemver(part.slice(2));
 if (!base) continue;
 if (compareSemver(v, base) > 0) return false;
 } else if (part.startsWith('<')) {
 const base = parseSemver(part.slice(1));
 if (!base) continue;
 if (compareSemver(v, base) >= 0) return false;
 } else if (part.startsWith('=')) {
 const base = parseSemver(part.slice(1));
 if (!base) continue;
 if (compareSemver(v, base) !== 0) return false;
 } else {
 // exact or loose (e.g., "1.0.0", "0.3.x")
 if (part.includes('x') || part.includes('*')) {
 const segs = part.split('.');
 const vSegs = version.split('.');
 for (let i = 0; i < segs.length; i++) {
 if (segs[i] === 'x' || segs[i] === '*') continue;
 if (segs[i] !== vSegs[i]) return false;
 }
 } else {
 const base = parseSemver(part);
 if (!base) continue;
 if (compareSemver(v, base) !== 0) return false;
 }
 }
 }
 return true;
}


export interface HostOptions {
 hostVersion?: string;
 extensionPathBase?: string;
 eventBus?: NotronEventBus;
 globalMemento?: Memento;
 // logger for host-level messages
 hostLogChannel?: OutputChannel;
}

export class ExtensionHost {
 private extensions = new Map<string, ResolvedExtension>();
 private contributions = new Map<string, Disposable>();
 private activationOrder: string[] = [];
 private circularIds = new Set<string>();
 private bus: NotronEventBus;
 private hostLog: OutputChannel;
 private hostVersion: string;

 constructor(options: HostOptions = {}) {
 this.bus = options.eventBus ?? new NotronEventBus();
 this.hostVersion = options.hostVersion ?? '0.1.0';
 this.hostLog =
 options.hostLogChannel ?? createOutputChannel('Extension Host');
 }

 get eventBus(): NotronEventBus {
 return this.bus;
 }

 get logChannel(): OutputChannel {
 return this.hostLog;
 }

 get allExtensions(): ResolvedExtension[] {
 return [...this.extensions.values()];
 }

 getExtension(id: string): ResolvedExtension | undefined {
 return this.extensions.get(id);
 }

 /** Register extensions before activation — performs dependency sort. */
 register(manifests: ExtensionManifest[], modules: Map<string, ExtensionModule>): void {
 const { order, circular, missing } = topologicalSort(manifests);

 // mark circular as failed
 for (const cycle of circular) {
 for (const id of cycle) this.circularIds.add(id);
 this.hostLog.appendLine(`[ExtensionHost] Circular dependency detected: ${cycle.join(' -> ')}`);
 console.error('[ExtensionHost] Circular dependency:', cycle);
 }

 for (const miss of missing) {
 this.hostLog.appendLine(`[ExtensionHost] Missing dependency: ${miss.id} -> ${miss.dep}`);
 }

 // Build resolved list in sorted order, but keep original order for reporting
 const manifestMap = new Map(manifests.map((m) => [m.id, m]));
 // also include manifests that were not in sorted order due to circular — they remain blocked
 const sortedManifests: ExtensionManifest[] = [];
 for (const id of order) {
 const m = manifestMap.get(id);
 if (m) sortedManifests.push(m);
 }
 // For any manifest not in order (circular), keep them but marked blocked
 for (const m of manifests) {
 if (!order.includes(m.id)) {
 // circular — already logged
 const mod = modules.get(m.id);
 if (mod) {
 const ctx = new ExtensionContext({ id: m.id });
 this.extensions.set(m.id, {
 manifest: m,
 module: mod,
 context: ctx,
 activated: false,
 activationError: new Error(`Blocked due to circular dependency: ${[...circular.find((c) => c.includes(m.id)) ?? []].join(' -> ')}`),
 });
 }
 }
 }

 this.activationOrder = order;
 for (const m of sortedManifests) {
 const mod = modules.get(m.id);
 if (!mod) {
 this.hostLog.appendLine(`[ExtensionHost] No module found for ${m.id} — skipped`);
 continue;
 }
 const ctx = new ExtensionContext({ id: m.id });
 this.extensions.set(m.id, {
 manifest: m,
 module: mod,
 context: ctx,
 activated: false,
 });
 // register declarative contributes (viewsContainers, views, menus, languages, grammars, themes)
 try {
 const c = registerManifestContributions(m, m.id);
 this.contributions.set(m.id, c);
 // auto-dispose when extension deactivates
 ctx.subscriptions.push(c);
 } catch (err) {
 console.warn(`[ExtensionHost] contributions for ${m.id} failed:`, err);
 }
 }
 }

 /** Activate all registered extensions in dependency order with error isolation. */
 async activateAll(): Promise<void> {
 for (const id of this.activationOrder) {
 if (this.circularIds.has(id)) continue;
 const entry = this.extensions.get(id);
 if (!entry) continue;
 // skip if dependency failed
 const deps = entry.manifest.extensionDependencies ?? [];
 const failedDep = deps.find((dep) => {
 const depEntry = this.extensions.get(dep);
 return !depEntry || depEntry.activationError || !depEntry.activated;
 });
 // Also check missing deps: if dep not in extensions at all, it's missing
 const missingDep = deps.find((dep) => !this.extensions.has(dep));
 if (failedDep || missingDep) {
 const reason = failedDep ? `dependency "${failedDep}" failed` : `missing dependency "${missingDep}"`;
 const err = new Error(`Skipped due to dependency failure: ${reason}`);
 entry.activationError = err;
 this.hostLog.appendLine(`[ExtensionHost] ${id} skipped: ${err.message}`);
 continue;
 }

 // version check
 if (!isCompatible(entry.manifest, this.hostVersion)) {
 const err = new Error(`Incompatible with host ${this.hostVersion} (requires ${entry.manifest.engines.notron})`);
 entry.activationError = err;
 this.hostLog.appendLine(`[ExtensionHost] ${id} incompatible: ${err.message}`);
 entry.context.logChannel.appendLine(`[host] Incompatible: ${err.message}`);
 continue;
 }

 try {
 const result = entry.module.activate(entry.context);
 const resolved = result instanceof Promise ? await result : result;
 if (resolved !== undefined) entry.exports = resolved;
 entry.activated = true;
 this.hostLog.appendLine(`[ExtensionHost] Activated ${id}`);
 } catch (err) {
 const wrapped = new ExtensionActivationError(id, err);
 entry.activationError = wrapped;
 this.hostLog.appendLine(`[ExtensionHost] Activation failed for ${id}: ${wrapped.message}`);
 entry.context.logChannel.appendLine(`[host] Activation failed: ${wrapped.message}`);
 console.error(wrapped.message, err);
 // do not throw — isolation: continue to next extension
 }
 }
 }

 /** Deactivate all in reverse activation order with error isolation. */
 async deactivateAll(): Promise<void> {
 const reverse = [...this.activationOrder].reverse();
 for (const id of reverse) {
 const entry = this.extensions.get(id);
 if (!entry) continue;
 const wasActivated = entry.activated;
 if (wasActivated) {
 try {
 if (entry.module.deactivate) {
 const r = entry.module.deactivate();
 if (r instanceof Promise) await r;
 }
 } catch (err) {
 const wrapped = new ExtensionRuntimeError(id, 'deactivate', err);
 this.hostLog.appendLine(`[ExtensionHost] Deactivate failed for ${id}: ${wrapped.message}`);
 entry.context.logChannel.appendLine(`[host] Deactivate failed: ${wrapped.message}`);
 console.error(wrapped.message, err);
 }
 }
 // Dispose subscriptions regardless of activated state (declarative contributes live in subscriptions)
 try {
 entry.context.dispose();
 } catch (err) {
 console.error(`[ExtensionHost] dispose subscriptions failed for ${id}:`, err);
 }
 entry.activated = false;
 }
 // also deactivate any circular-blocked entries' contexts
 for (const [id, entry] of this.extensions) {
 if (!this.activationOrder.includes(id)) {
 try {
 entry.context.dispose();
 } catch {
 // ignore
 }
 }
 }
 // Ensure declarative contributions are disposed even if context dispose missed (non-activated entries)
 for (const [id, d] of this.contributions) {
 try {
 // If context already disposed this is no-op (idempotent)
 if (this.extensions.has(id)) {
 // already handled via context.dispose; just clear map entry
 } else {
 d.dispose();
 }
 } catch { /* ignore */ }
 }
 this.contributions.clear();
 }

 /** Dispose host itself. */
 dispose(): void {
 for (const d of this.contributions.values()) {
 try { d.dispose(); } catch { /* ignore */ }
 }
 this.contributions.clear();
 this.bus.clear();
 // hostLog kept for post-mortem, not disposed aggressively
 }
}
