/**
 * Init
 *
 * Scaffold a new extension from a template.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getTemplatesDir, listTemplatesSync } from './utils.js';

export interface InitOptions {
 cwd?: string;
 template?: string;
}

const VALID_TEMPLATES = ['hello-world', 'webview-view', 'language-support', 'custom-editor'];

export function listTemplatesCommand(): string[] {
 const fromDir = listTemplatesSync();
 if (fromDir.length > 0) return fromDir;
 return [...VALID_TEMPLATES];
}

export async function initCommand(projectNameArg?: string, opts: InitOptions = {}): Promise<string> {
 const cwd = opts.cwd ?? process.cwd();
 const templateName = opts.template ?? 'hello-world';

 const available = listTemplatesCommand();
 if (!available.includes(templateName)) {
 throw new Error(`[notron-sdk] unknown template "${templateName}" — available: ${available.join(', ')}`);
 }

 const templatesDir = getTemplatesDir();
 if (!templatesDir) throw new Error('[notron-sdk] templates dir not found (expected src/cli/templates)');
 const templateDir = path.join(templatesDir, templateName);
 if (!fs.existsSync(templateDir)) throw new Error(`[notron-sdk] template dir missing: ${templateDir}`);

 // Determine target dir
 let targetDir: string;
 let projectName = projectNameArg;
 if (projectName) {
 // sanitize: if projectName contains path separators, treat as path
 targetDir = path.resolve(cwd, projectName);
 // derive project name from basename if path
 projectName = path.basename(projectName);
 } else {
 targetDir = cwd;
 // if cwd already has manifest, error
 if (fs.existsSync(path.join(targetDir, 'manifest.json'))) {
 throw new Error('[notron-sdk] manifest.json already exists in target dir — provide a new project name or use empty dir');
 }
 projectName = path.basename(targetDir);
 }

 // if targetDir exists and is not empty, error (unless it's cwd with --force? we keep strict)
 if (fs.existsSync(targetDir)) {
 const entries = fs.readdirSync(targetDir);
 // if target is cwd and we passed no projectName, we allow empty; already checked manifest.
 // if projectName was provided, target should be empty/new
 if (projectNameArg && entries.length > 0) {
 throw new Error(`[notron-sdk] target dir already exists and is not empty: ${targetDir}`);
 }
 }

 fs.mkdirSync(targetDir, { recursive: true });

 // copy recursively
 copyTemplateDir(templateDir, targetDir);

 // Try to patch manifest.json and package.json with projectName if template was hello-world
 // Keep publisher as `acme` for simplicity; id becomes `acme.<sanitized>`
 const sanitized = sanitizeName(projectName!);
 patchGeneratedProject(targetDir, sanitized);

 console.log(`[notron-sdk] initialized ${templateName} → ${path.relative(cwd, targetDir) || '.'}`);
 console.log(`[notron-sdk] next: cd ${projectNameArg ?? '.'} && npm install && notron-sdk build`);

 return targetDir;
}

function sanitizeName(name: string): string {
 return name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'my-extension';
}

function patchGeneratedProject(targetDir: string, sanitizedName: string): void {
 const manifestPath = path.join(targetDir, 'manifest.json');
 if (fs.existsSync(manifestPath)) {
 try {
 const raw = fs.readFileSync(manifestPath, 'utf-8');
 const json = JSON.parse(raw);
 // If template name is hello-world, replace occurrences
 const publisher = json.publisher ?? 'acme';
 // id: publisher.name
 if (json.id && typeof json.id === 'string') {
 // replace suffix after dot
 const parts = (json.id as string).split('.');
 if (parts.length === 2) json.id = `${parts[0]}.${sanitizedName}`;
 else json.id = `${publisher}.${sanitizedName}`;
 }
 if (json.name) json.name = sanitizedName;
 // command: replace hello-world.hello with <name>.hello
 if (json.contributes?.commands) {
 for (const cmd of json.contributes.commands as Array<{ command: string }>) {
 if (cmd.command.includes('hello-world')) {
 cmd.command = cmd.command.replace(/hello-world/g, sanitizedName);
 }
 }
 }
 // activationEvents
 if (Array.isArray(json.activationEvents)) {
 json.activationEvents = (json.activationEvents as string[]).map((e: string) => e.replace(/hello-world/g, sanitizedName));
 }
 fs.writeFileSync(manifestPath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
 } catch {
 // ignore patch errors
 }
 }
 const pkgPath = path.join(targetDir, 'package.json');
 if (fs.existsSync(pkgPath)) {
 try {
 const raw = fs.readFileSync(pkgPath, 'utf-8');
 const json = JSON.parse(raw);
 if (json.name) json.name = sanitizedName;
 fs.writeFileSync(pkgPath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
 } catch {
 // ignore
 }
 }
 // also patch src/extension.ts command string
 const extPath = path.join(targetDir, 'src', 'extension.ts');
 if (fs.existsSync(extPath)) {
 try {
 let content = fs.readFileSync(extPath, 'utf-8');
 if (content.includes('hello-world.hello')) {
 content = content.replace(/hello-world\.hello/g, `${sanitizedName}.hello`);
 content = content.replace(/hello-world/g, sanitizedName);
 fs.writeFileSync(extPath, content, 'utf-8');
 }
 } catch {
 // ignore
 }
 }
}

function copyTemplateDir(srcDir: string, destDir: string): void {
 const entries = fs.readdirSync(srcDir, { withFileTypes: true });
 for (const entry of entries) {
 const srcPath = path.join(srcDir, entry.name);
 // handle gitignore -> .gitignore
 let destName = entry.name;
 if (entry.name === 'gitignore') destName = '.gitignore';
 const destPath = path.join(destDir, destName);
 if (entry.isDirectory()) {
 fs.mkdirSync(destPath, { recursive: true });
 copyTemplateDir(srcPath, destPath);
 } else if (entry.isFile()) {
 fs.mkdirSync(path.dirname(destPath), { recursive: true });
 fs.copyFileSync(srcPath, destPath);
 }
 }
}
