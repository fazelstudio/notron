/**
 * CLI
 *
 * Command line interface with six commands.
 */
import { initCommand, listTemplatesCommand } from './init.js';
import { buildCommand } from './build.js';
import { packageCommand } from './package.js';
import { validateCommand } from './validate.js';
import { installLocalCommand } from './install.js';

const VERSION = '0.1.0';

function printHelp(): void {
 console.log(`
notron-sdk v${VERSION} — Notron Extension SDK

Usage:
 notron-sdk init [name] [--template <name>] scaffold new extension
 notron-sdk build [--watch] bundle src → dist (dev, sourcemap)
 notron-sdk package prod build + .ntrn archive
 notron-sdk validate [path] validate manifest.json
 notron-sdk install-local <path.ntrn> extract to ~/.notron/extensions-dev (dev only)
 notron-sdk list-templates list available templates
 notron-sdk --help | -h show help
 notron-sdk --version | -v show version

Templates:
 hello-world basic command (fully implemented)
 webview-view sidebar webview (stub — see IMPLEMENTATION_LOG.md Phase 5)
 language-support language + grammar (stub)
 custom-editor custom editor / preview (stub)

Bundling:
 esbuild bundles src/extension.ts → manifest.main (default dist/extension.js)
 external: notron-sdk (peer, not bundled). Config via notron-extension.config.{ts,js,json}
 format: cjs (CommonJS) — Host loads via dynamic import interop (see README).

Checksums:
 checksums.json: { "dist/extension.js": "sha256:...", ... } SHA-256 per file.
 verify via: import { verifyChecksum } from 'notron-sdk/utils' (async).

Dev loop:
 notron-sdk init my-ext && cd my-ext && npm install
 notron-sdk build --watch # in one terminal
 notron-sdk package && notron-sdk install-local my-ext-0.1.0.ntrn

Notes:
 install-local is dev convenience only — whether Notron core reads
 ~/.notron/extensions-dev at startup is core's responsibility (currently
 core has no .ntrn loader; gap documented in IMPLEMENTATION_LOG Phase 5).
`.trim());
}

export async function runCli(argv: string[]): Promise<void> {
 const cmd = argv[0];
 if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
 printHelp();
 return;
 }
 if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
 console.log(VERSION);
 return;
 }

 switch (cmd) {
 case 'init': {
 // init [name] [--template name] or init [name] [template]
 let projectName: string | undefined;
 let template: string | undefined;
 const args = argv.slice(1);
 for (let i = 0; i < args.length; i++) {
 const a = args[i]!;
 if (a === '--template' || a === '-t') {
 template = args[i + 1];
 i++;
 } else if (a.startsWith('--template=')) {
 template = a.split('=')[1];
 } else if (a.startsWith('-')) {
 console.warn(`[notron-sdk] unknown flag for init: ${a}`);
 } else if (!projectName) {
 projectName = a;
 } else if (!template) {
 template = a;
 }
 }
 await initCommand(projectName, { template });
 break;
 }
 case 'list-templates': {
 const list = listTemplatesCommand();
 console.log('[notron-sdk] available templates:');
 for (const t of list) console.log(` - ${t}`);
 break;
 }
 case 'build': {
 const watch = argv.includes('--watch') || argv.includes('-w');
 await buildCommand({ watch });
 if (watch) {
 // keep alive — esbuild context watches; prevent exit
 await new Promise(() => {});
 }
 break;
 }
 case 'package': {
 await packageCommand();
 break;
 }
 case 'validate': {
 const manifestArg = argv[1] && !argv[1]!.startsWith('-') ? argv[1] : undefined;
 const result = await validateCommand(manifestArg);
 if (!result.valid) process.exitCode = 1;
 break;
 }
 case 'install-local': {
 const ntrnPath = argv[1];
 if (!ntrnPath) {
 console.error('[notron-sdk] install-local requires <path-to-.ntrn>');
 process.exitCode = 1;
 printHelp();
 break;
 }
 await installLocalCommand(ntrnPath);
 break;
 }
 default: {
 console.error(`[notron-sdk] unknown command: ${cmd}`);
 printHelp();
 process.exitCode = 1;
 }
 }
}

// Back-compat stub from template
export function createCli(): { run: (argv: string[]) => Promise<void> } {
 return { run: runCli };
}

// Re-export individual commands for programmatic use / tests
export { initCommand, listTemplatesCommand } from './init.js';
export { buildCommand } from './build.js';
export { packageCommand } from './package.js';
export { validateCommand } from './validate.js';
export { installLocalCommand } from './install.js';
