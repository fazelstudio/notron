/**
 * Build
 *
 * Bundle an extension with esbuild.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as esbuild from 'esbuild';
import { findProjectRoot, loadExtensionConfig, readManifestSync } from './utils.js';

export interface BuildOptions {
 cwd?: string;
 watch?: boolean;
 minify?: boolean;
 sourcemap?: boolean | 'inline' | 'external';
}

export async function buildCommand(opts: BuildOptions = {}): Promise<void> {
 const cwd = opts.cwd ?? process.cwd();
 const projectRoot = findProjectRoot(cwd);
 const manifestPath = path.join(projectRoot, 'manifest.json');
 if (!fs.existsSync(manifestPath)) {
 throw new Error(`[notron-sdk] manifest.json not found at ${manifestPath} (cwd: ${cwd})`);
 }
 const manifest = readManifestSync(manifestPath);
 const config = await loadExtensionConfig(projectRoot);

 // Resolve entry
 const entryCandidates = [
 config.entry ? path.resolve(projectRoot, config.entry) : null,
 path.join(projectRoot, 'src/extension.ts'),
 path.join(projectRoot, 'src/index.ts'),
 ].filter(Boolean) as string[];
 let entry: string | null = null;
 for (const cand of entryCandidates) {
 if (fs.existsSync(cand)) {
 entry = cand;
 break;
 }
 }
 if (!entry) {
 throw new Error(`[notron-sdk] entry not found — tried: ${entryCandidates.join(', ')}`);
 }

 // Resolve outfile
 const outfileRel = config.outfile ?? manifest.main ?? './dist/extension.js';
 const outfile = path.resolve(projectRoot, outfileRel.replace(/^\.\//, ''));
 const outDir = path.dirname(outfile);
 fs.mkdirSync(outDir, { recursive: true });

 const minify = opts.minify ?? config.minify ?? false;
 // sourcemap logic: CLI opts > config > default (build true, package false)
 let sourcemap: boolean | 'inline' | 'external';
 if (opts.sourcemap !== undefined) sourcemap = opts.sourcemap;
 else if (config.sourcemap !== undefined) sourcemap = config.sourcemap;
 else sourcemap = !minify; // dev = true, prod = false

 // esbuild format — `cjs` is default (Host loads via interop), document in README
 const format = (config.format ?? 'cjs') as 'cjs' | 'esm';
 const external = ['notron-sdk', ...(config.external ?? [])];
 const target = config.target ?? 'es2020';

 const buildOptions: esbuild.BuildOptions = {
 entryPoints: [entry],
 bundle: true,
 platform: 'node',
 target: Array.isArray(target) ? target : [target as string],
 format,
 outfile,
 external,
 sourcemap: sourcemap === true ? true : sourcemap === 'inline' ? 'inline' : sourcemap === 'external' ? true : false,
 minify,
 sourcesContent: false,
 logLevel: 'info',
 // allow config overrides
 ...(config.esbuildOptions as esbuild.BuildOptions | undefined),
 };

 // Ensure esbuildOptions don't accidentally override critical fields incorrectly
 // (outfile vs outdir etc.)
 if (opts.watch) {
 // Use context API if available (esbuild >=0.17)
 const ctx = await (esbuild as unknown as { context: (o: esbuild.BuildOptions) => Promise<{ watch: () => Promise<void>; dispose: () => Promise<void> }> }).context(buildOptions);
 await ctx.watch();
 console.log(`[notron-sdk] watching ${path.relative(projectRoot, entry)} → ${path.relative(projectRoot, outfile)} (format: ${format}, minify: ${minify}, sourcemap: ${String(sourcemap)})`);
 // keep process alive — caller may await forever; we don't dispose
 } else {
 await esbuild.build(buildOptions);
 console.log(`[notron-sdk] built ${path.relative(projectRoot, outfile)} (format: ${format}, minify: ${minify}, sourcemap: ${String(sourcemap)})`);
 }
}
