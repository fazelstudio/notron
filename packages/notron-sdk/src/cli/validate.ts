/**
 * Validate
 *
 * Validate a manifest and its referenced files.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateManifestWithFiles, formatValidationErrors, findProjectRoot } from './utils.js';
import type { ExtensionManifest } from '../types/index.js';

export interface ValidateOptions {
 cwd?: string;
 manifestPath?: string;
}

export async function validateCommand(manifestArg?: string, opts: ValidateOptions = {}): Promise<{ valid: boolean; errors: string[]; manifestPath: string }> {
 const cwd = opts.cwd ?? process.cwd();
 let manifestPath: string;
 if (manifestArg) {
 const resolved = path.resolve(cwd, manifestArg);
 if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
 manifestPath = path.join(resolved, 'manifest.json');
 } else {
 manifestPath = resolved;
 }
 } else if (opts.manifestPath) {
 manifestPath = path.resolve(cwd, opts.manifestPath);
 } else {
 // default: cwd/manifest.json or findProjectRoot
 const maybe = path.join(cwd, 'manifest.json');
 if (fs.existsSync(maybe)) manifestPath = maybe;
 else {
 const root = findProjectRoot(cwd);
 manifestPath = path.join(root, 'manifest.json');
 }
 }

 if (!fs.existsSync(manifestPath)) {
 const errors = [`manifest: file not found: ${manifestPath}`];
 if (!opts.cwd) {
 console.error(`[notron-sdk] ${errors[0]}`);
 }
 return { valid: false, errors, manifestPath };
 }

 let manifest: ExtensionManifest;
 try {
 const raw = fs.readFileSync(manifestPath, 'utf-8');
 manifest = JSON.parse(raw) as ExtensionManifest;
 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err);
 const errors = [`manifest: JSON parse error: ${msg}`];
 return { valid: false, errors, manifestPath };
 }

 const manifestDir = path.dirname(manifestPath);
 const result = validateManifestWithFiles(manifest, manifestDir);

 if (result.valid) {
 console.log(`[notron-sdk] ✓ manifest valid: ${path.relative(cwd, manifestPath)}`);
 } else {
 console.error(`[notron-sdk] ✖ manifest invalid: ${path.relative(cwd, manifestPath)}`);
 console.error(formatValidationErrors(result.errors));
 }

 return { valid: result.valid, errors: result.errors, manifestPath };
}
