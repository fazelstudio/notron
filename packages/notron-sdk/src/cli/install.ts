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

 zip.extractAllTo(destDir, true);
 console.log(`[notron-sdk] installed ${extensionId} → ${destDir}`);
 console.log('[notron-sdk] NOTE: install-local is for development/testing only.');
 console.log('[notron-sdk] Whether Notron core actually reads ~/.notron/extensions-dev at startup');
 console.log('[notron-sdk] is the responsibility of core (see NOTRON_SDK_04_PACKAGE_CLI and');
 console.log('[notron-sdk] IMPLEMENTATION_LOG.md Phase 5 Gap — core does not yet auto-load .ntrn).');

 // Gap check: does core have loader?
 // We note that Notron core currently has no `.ntrn` loader nor extensions-dev reader
 // (verified: no watcher for that dir, no Tauri command to load .ntrn).

 return destDir;
}
