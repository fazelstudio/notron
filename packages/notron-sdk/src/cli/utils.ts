/**
 * CLI Utilities
 *
 * Helpers for manifest resolution and file collection.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ExtensionManifest, NotronExtensionConfig } from '../types/index.js';
import { validateManifest } from '../utils/index.js';

// Project root resolution

export function findProjectRoot(cwd: string): string {
 let cur = path.resolve(cwd);
 const root = path.parse(cur).root;
 // eslint-disable-next-line no-constant-condition
 while (true) {
 if (fs.existsSync(path.join(cur, 'manifest.json'))) return cur;
 if (cur === root) break;
 cur = path.dirname(cur);
 }
 return path.resolve(cwd);
}

// Manifest I/O

export function readManifestSync(manifestPath: string): ExtensionManifest {
 const raw = fs.readFileSync(manifestPath, 'utf-8');
 const json = JSON.parse(raw);
 return json as ExtensionManifest;
}

export async function readManifest(manifestPath: string): Promise<ExtensionManifest> {
 const raw = await fs.promises.readFile(manifestPath, 'utf-8');
 return JSON.parse(raw) as ExtensionManifest;
}

// Extension config loading (`notron-extension.config.*`)

const CONFIG_BASENAMES = [
 'notron-extension.config.ts',
 'notron-extension.config.js',
 'notron-extension.config.mjs',
 'notron-extension.config.cjs',
 'notron-extension.config.json',
];

export async function loadExtensionConfig(projectRoot: string): Promise<NotronExtensionConfig> {
 for (const base of CONFIG_BASENAMES) {
 const full = path.join(projectRoot, base);
 if (!fs.existsSync(full)) continue;
 if (base.endsWith('.json')) {
 try {
 const raw = fs.readFileSync(full, 'utf-8');
 const parsed = JSON.parse(raw);
 // support `export default` wrapper? JSON is plain object
 return (parsed.default ?? parsed) as NotronExtensionConfig;
 } catch (err) {
 console.warn(`[notron-sdk] failed to parse ${base}:`, err);
 return {};
 }
 }
 // JS/TS config — dynamic import
 try {
 const url = pathToFileURL(full).href;
 const mod = await import(url);
 const cfg = (mod.default ?? mod) as NotronExtensionConfig | (() => NotronExtensionConfig);
 if (typeof cfg === 'function') return (cfg as () => NotronExtensionConfig)();
 if (typeof cfg === 'object' && cfg !== null) return cfg;
 console.warn(`[notron-sdk] ${base} did not export an object, using defaults`);
 return {};
 } catch (err) {
 console.warn(`[notron-sdk] failed to load ${base}:`, err);
 return {};
 }
 }
 return {};
}

// Contributed file collection

export function collectContributedFiles(manifest: ExtensionManifest): string[] {
 const out: string[] = [];
 const c = manifest.contributes as Record<string, unknown> | undefined;
 if (!c) {
 if (manifest.icon) out.push(manifest.icon);
 return out;
 }
 if (manifest.icon) out.push(manifest.icon);
 // languages.configuration
 const languages = c.languages as Array<{ configuration?: string }> | undefined;
 if (Array.isArray(languages)) {
 for (const lang of languages) if (lang.configuration) out.push(lang.configuration);
 }
 // grammars.path
 const grammars = c.grammars as Array<{ path: string }> | undefined;
 if (Array.isArray(grammars)) for (const g of grammars) out.push(g.path);
 // themes / iconThemes / productIconThemes
 for (const key of ['themes', 'iconThemes', 'productIconThemes'] as const) {
 const arr = c[key] as Array<{ path: string }> | undefined;
 if (Array.isArray(arr)) for (const t of arr) out.push(t.path);
 }
 // snippets
 const snippets = c.snippets as Array<{ path: string }> | undefined;
 if (Array.isArray(snippets)) for (const s of snippets) out.push(s.path);
 // debuggers.program
 const debuggers = c.debuggers as Array<{ program?: string }> | undefined;
 if (Array.isArray(debuggers)) for (const d of debuggers) if (d.program) out.push(d.program);
 return out;
}

// Misc helpers

export function toPosixRel(projectRoot: string, absPath: string): string {
 const rel = path.relative(projectRoot, absPath);
 return rel.split(path.sep).join(path.posix.sep);
}

export function ensureDir(dir: string): void {
 fs.mkdirSync(dir, { recursive: true });
}

export function getTemplatesDir(): string | null {
 // Try dist location first (when running from compiled JS)
 const candidates: string[] = [];
 try {
 const here = fileURLToPath(import.meta.url);
 const dirOfThisFile = path.dirname(here);
 candidates.push(path.join(dirOfThisFile, 'templates'));
 candidates.push(path.join(dirOfThisFile, '..', 'cli', 'templates'));
 candidates.push(path.join(dirOfThisFile, '../../src/cli/templates'));
 } catch {
 // ignore
 }
 // Fallbacks for dev (cwd-based)
 candidates.push(path.resolve(process.cwd(), 'packages/notron-sdk/src/cli/templates'));
 candidates.push(path.resolve(process.cwd(), 'src/cli/templates'));
 for (const c of candidates) {
 try {
 if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
 // verify at least hello-world exists
 if (fs.existsSync(path.join(c, 'hello-world'))) return c;
 }
 } catch {
 // ignore
 }
 }
 return null;
}

export function listTemplatesSync(): string[] {
 const dir = getTemplatesDir();
 if (!dir) return [];
 const entries = fs.readdirSync(dir, { withFileTypes: true });
 return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

export function formatValidationErrors(errors: string[]): string {
 return errors.map((e) => ` ✖ ${e}`).join('\n');
}

export function validateManifestWithFiles(manifest: ExtensionManifest, manifestDir: string): { valid: boolean; errors: string[] } {
 const base = validateManifest(manifest);
 const errors = [...base.errors];
 // check contributed file existence
 const refs = collectContributedFiles(manifest);
 for (const rel of refs) {
 const abs = path.resolve(manifestDir, rel);
 if (!fs.existsSync(abs)) {
 errors.push(`contributes: referenced file not found: "${rel}"`);
 }
 }
 // check icon
 if (manifest.icon) {
 const abs = path.resolve(manifestDir, manifest.icon);
 if (!fs.existsSync(abs)) errors.push(`icon: file not found: "${manifest.icon}"`);
 }
 return { valid: errors.length === 0, errors };
}

export function getDefaultDevExtensionsDir(): string {
 return path.join(os.homedir(), '.notron', 'extensions-dev');
}
