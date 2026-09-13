/**
 * Package
 *
 * Build and archive an extension package.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import { findProjectRoot, readManifestSync, collectContributedFiles } from './utils.js';
import { validateCommand } from './validate.js';
import { buildCommand } from './build.js';
import { computeChecksumSync } from '../utils/index.js';

export interface PackageOptions {
 cwd?: string;
 outFile?: string;
}

export async function packageCommand(opts: PackageOptions = {}): Promise<string> {
 const cwd = opts.cwd ?? process.cwd();
 const projectRoot = findProjectRoot(cwd);
 const manifestPath = path.join(projectRoot, 'manifest.json');
 if (!fs.existsSync(manifestPath)) throw new Error(`[notron-sdk] manifest.json not found at ${manifestPath}`);

 const manifest = readManifestSync(manifestPath);

 // Validate manifest before packaging.
 const validation = await validateCommand(undefined, { cwd: projectRoot, manifestPath });
 if (!validation.valid) {
 throw new Error(`[notron-sdk] package aborted: manifest invalid\n${validation.errors.join('\n')}`);
 }

 // Build for production.
 await buildCommand({ cwd: projectRoot, minify: true, sourcemap: false });

 // Collect files for archive.
 const filesToZip = new Map<string, Buffer>();

 function addFile(posixRel: string, absPath: string): void {
 if (!fs.existsSync(absPath)) return;
 const stat = fs.statSync(absPath);
 if (stat.isDirectory()) return;
 const content = fs.readFileSync(absPath);
 filesToZip.set(posixRel, content);
 }

 // manifest.json
 addFile('manifest.json', manifestPath);

 // dist/extension.js (from manifest.main)
 const outfileRelRaw = manifest.main ?? './dist/extension.js';
 const outfileRelPosix = outfileRelRaw.replace(/^\.\//, '').split(path.sep).join(path.posix.sep);
 const outfileAbs = path.resolve(projectRoot, outfileRelRaw.replace(/^\.\//, ''));
 if (!fs.existsSync(outfileAbs)) throw new Error(`[notron-sdk] built file not found after build: ${outfileAbs}`);
 addFile(outfileRelPosix, outfileAbs);
 // Clean up stale map from previous dev build.
 const mapAbs = `${outfileAbs}.map`;
 if (fs.existsSync(mapAbs)) {
 try {
 fs.unlinkSync(mapAbs);
 } catch {
 // ignore
 }
 }

 // README / CHANGELOG if exist
 for (const name of ['README.md', 'CHANGELOG.md']) {
 const p = path.join(projectRoot, name);
 if (fs.existsSync(p)) addFile(name, p);
 }

 // contributed files
 const contributed = collectContributedFiles(manifest);
 for (const rel of contributed) {
 const normalized = rel.replace(/^\.\//, '').split(path.sep).join(path.posix.sep);
 const abs = path.resolve(projectRoot, rel);
 if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
 if (!filesToZip.has(normalized)) addFile(normalized, abs);
 } else {
 console.warn(`[notron-sdk] warning: contributed file not found, skipping: ${rel}`);
 }
 }

 // assets folder (if exists) — include recursively
 const assetsDir = path.join(projectRoot, 'assets');
 if (fs.existsSync(assetsDir) && fs.statSync(assetsDir).isDirectory()) {
 const walk = (dir: string, basePosix: string): void => {
 for (const entry of fs.readdirSync(dir)) {
 const abs = path.join(dir, entry);
 const stat = fs.statSync(abs);
 const posix = path.posix.join(basePosix, entry);
 if (stat.isDirectory()) walk(abs, posix);
 else if (!filesToZip.has(posix)) addFile(posix, abs);
 }
 };
 walk(assetsDir, 'assets');
 }

 // Compute checksums.
 const checksums: Record<string, string> = {};
 for (const [rel, content] of filesToZip.entries()) {
 checksums[rel] = computeChecksumSync(content);
 }
  // Signature placeholder reserved for future code signing.
  // Not included in checksums map; `signature` would be separate field.
 const checksumsJson = JSON.stringify(checksums, null, 2);
 filesToZip.set('checksums.json', Buffer.from(checksumsJson, 'utf-8'));

 // Write archive.
 const zip = new AdmZip();
 for (const [rel, content] of filesToZip.entries()) {
 zip.addFile(rel, content);
 }
 const outName = opts.outFile ?? `${manifest.name}-${manifest.version}.ntrn`;
 // ensure outName has .ntrn extension
 const finalName = outName.endsWith('.ntrn') ? outName : `${outName}.ntrn`;
 const outPath = path.isAbsolute(finalName) ? finalName : path.join(projectRoot, finalName);
 zip.writeZip(outPath);
 const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
 console.log(`[notron-sdk] packaged ${path.relative(projectRoot, outPath)} (${filesToZip.size} files, ${sizeKb} KB)`);
 console.log(`[notron-sdk] checksums: ${Object.keys(checksums).length} entries + checksums.json`);
 console.log(`[notron-sdk] note: code signing (signature) not implemented — placeholder reserved (see README/IMPLEMENTATION_LOG)`);

 return outPath;
}
