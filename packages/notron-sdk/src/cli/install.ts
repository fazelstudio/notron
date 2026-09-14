/**
 * Install
 *
 * Extract a package to the local dev folder.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import { getDefaultDevExtensionsDir } from './utils.js';

export interface InstallOptions {
 cwd?: string;
 devDir?: string;
}

export async function installLocalCommand(ntrnPathArg: string, opts: InstallOptions = {}): Promise<string> {
 const cwd = opts.cwd ?? process.cwd();
 const ntrnPath = path.resolve(cwd, ntrnPathArg);
 if (!fs.existsSync(ntrnPath)) throw new Error(`[notron-sdk] .ntrn not found: ${ntrnPath}`);
 if (!ntrnPath.endsWith('.ntrn')) console.warn(`[notron-sdk] warning: file does not end with .ntrn: ${ntrnPath}`);

 const zip = new AdmZip(ntrnPath);
 const manifestEntry = zip.getEntry('manifest.json');
 if (!manifestEntry) throw new Error('[notron-sdk] .ntrn missing manifest.json');
 const manifestRaw = manifestEntry.getData().toString('utf-8');
 let manifest: { id?: string; name?: string };
 try {
 manifest = JSON.parse(manifestRaw);
 } catch (err) {
 throw new Error(`[notron-sdk] invalid manifest.json in .ntrn: ${String(err)}`);
 }
 const extensionId = manifest.id;
 if (!extensionId || typeof extensionId !== 'string') throw new Error('[notron-sdk] manifest missing id');

 const devBase = opts.devDir ?? getDefaultDevExtensionsDir();
 const destDir = path.join(devBase, extensionId);

 // ensure base exists, clean dest if exists
 fs.mkdirSync(destDir, { recursive: true });
 // clear dest (remove existing files) — keep dir
 for (const entry of fs.readdirSync(destDir)) {
 const p = path.join(destDir, entry);
 fs.rmSync(p, { recursive: true, force: true });
 }

 let unpackedBytes = 0;
 for (const entry of zip.getEntries()) {
 const normalized = entry.entryName.replace(/\\/g, '/');
 if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
 throw new Error(`[notron-sdk] unsafe archive path: ${entry.entryName}`);
 }
 const target = path.resolve(destDir, normalized);
 const base = path.resolve(destDir) + path.sep;
 if (target !== path.resolve(destDir) && !target.startsWith(base)) {
 throw new Error(`[notron-sdk] unsafe archive path: ${entry.entryName}`);
 }
 if (entry.isDirectory) {
 fs.mkdirSync(target, { recursive: true });
 continue;
 }
 const data = entry.getData();
 unpackedBytes += data.length;
 if (unpackedBytes > 250 * 1024 * 1024) {
 throw new Error('[notron-sdk] unpacked package exceeds the 250 MB limit');
 }
 fs.mkdirSync(path.dirname(target), { recursive: true });
 fs.writeFileSync(target, data, { flag: 'wx' });
 }
 console.log(`[notron-sdk] installed ${extensionId} → ${destDir}`);
 console.log('[notron-sdk] NOTE: install-local is for development/testing only.');
 console.log('[notron-sdk] For user installation, use Notron Command Palette →');
 console.log('[notron-sdk] Extensions: Install from .ntrn…');

 return destDir;
}
