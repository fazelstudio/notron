/**
 * Run Service
 *
 * Runs launch configurations in the integrated terminal (PTY): detects
 * configurations, resolves variables and spawns the run terminal.
 */

import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { runStore, type RunConfiguration } from '../stores/run';
import { editorStore } from '../stores/editor';
import { uiStore } from '../stores/ui';
import { terminalStore } from '../stores/terminal';
import {
  entryToRunConfig,
  resolveEntries,
  resolvePythonInterpreter,
  type ResolvedEntry
} from './entryPointResolver';
import { get } from 'svelte/store';
import {
  getRunTarget,
  buildStandaloneStatements,
  isRunnableFile,
  quoteFor,
  type ShellDialect
} from '../utils/runTargets';
import { runProviderRegistry } from '../workbench/runRegistry';
import { taskRegistry } from '../workbench/taskRegistry';
// Side-effect import: publishes the built-in runtime providers.
import './run/runProviders';
import { getPlatformShells, getPlatformDefaultShell } from '../utils/platform';
import { settingsStore } from '../stores/settings.svelte';
import {
  RUN_STATUS_MS,
  RUN_TERMINAL_PREFIX,
  LAUNCH_JSON_DIR,
  LAUNCH_JSON_FILE
} from '../constants';

// Run service
// Runs a launch configuration in the integrated terminal (PTY).
//
// Flow mirrors VS Code's "Run Without Debugging":
//   detect configurations (launch.json → project manifests → active file)
//     → resolve variables → build PowerShell statements (+ env)
//       → spawn a dedicated, named terminal (replacing a previous run of the
//         same configuration) → surface Stop / preview in the Run panel.

function getWorkspaceRoot() {
  return uiStore.getSnapshot().explorerRoot || '';
}

function getActiveFilePath() {
  const tabs = editorStore.getTabsSnapshot();
  const activeId = editorStore.getActiveTabIdSnapshot();
  const activeTab = tabs.find(t => t.id === activeId) || null;
  if (!activeTab?.path) return null;
  if (activeTab.path.startsWith('Untitled') || activeTab.language === 'welcome') return null;
  return activeTab.path;
}

function dirname(path: string) {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? path : path.slice(0, idx);
}

function basename(path: string) {
  return path.split(/[/\\]/).pop() || path;
}

function basenameNoExt(path: string) {
  const name = basename(path);
  const idx = name.lastIndexOf('.');
  return idx === -1 ? name : name.slice(0, idx);
}

function normalizeToArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => String(v));
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}

function stripJsonComments(input: string) {
  let output = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      while (i < input.length && input[i] !== '\n') i++;
      output += '\n';
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i++;
      i++;
      continue;
    }

    output += char;
  }

  return output;
}

const PATH_SEPARATOR = '\\';

function substituteVariables(value: string, workspaceFolder: string, activeFile: string | null) {
  const replaceToken = (input: string, token: string, replacement: string) => input.split(token).join(replacement);
  let resolved = value;
  resolved = replaceToken(resolved, '${workspaceFolder}', workspaceFolder);
  resolved = replaceToken(resolved, '${workspaceFolderBasename}', workspaceFolder ? basename(workspaceFolder) : '');
  resolved = replaceToken(resolved, '${file}', activeFile || '');
  resolved = replaceToken(resolved, '${fileBasename}', activeFile ? basename(activeFile) : '');
  resolved = replaceToken(resolved, '${fileBasenameNoExtension}', activeFile ? basenameNoExt(activeFile) : '');
  resolved = replaceToken(resolved, '${fileExtname}', activeFile ? '.' + (activeFile.split('.').pop() || '') : '');
  resolved = replaceToken(resolved, '${fileDirname}', activeFile ? dirname(activeFile) : workspaceFolder);
  resolved = replaceToken(resolved, '${fileDirnameBasename}', activeFile ? basename(dirname(activeFile)) : '');
  const relFile = activeFile && workspaceFolder
    ? activeFile.replace(`${workspaceFolder}\\`, '').replace(`${workspaceFolder}/`, '')
    : '';
  resolved = replaceToken(resolved, '${relativeFile}', relFile);
  resolved = replaceToken(resolved, '${relativeFileDirname}', relFile ? dirname(relFile) : '');
  resolved = replaceToken(resolved, '${pathSeparator}', PATH_SEPARATOR);
  // ${env:NAME} cannot be read synchronously inside the webview; leave the
  // token intact so it stays visible instead of silently resolving to "".
  return value ? resolved : value;
}

function resolveConfiguration(config: RunConfiguration, workspaceFolder: string, activeFile: string | null): RunConfiguration {
  const resolveValue = (value?: string) => value ? substituteVariables(value, workspaceFolder, activeFile) : value;
  return {
    ...config,
    program: resolveValue(config.program),
    cwd: resolveValue(config.cwd) || workspaceFolder,
    runtimeExecutable: resolveValue(config.runtimeExecutable),
    runtimeArgs: config.runtimeArgs?.map(arg => substituteVariables(arg, workspaceFolder, activeFile)),
    args: config.args?.map(arg => substituteVariables(arg, workspaceFolder, activeFile)),
    url: resolveValue(config.url),
    env: config.env
      ? Object.fromEntries(Object.entries(config.env).map(([key, value]) => [key, substituteVariables(value, workspaceFolder, activeFile)]))
      : undefined
  };
}

async function openEditorTab(path: string) {
  const name = basename(path);
  const isImage = /\.(png|jpe?g|gif|webp|ico)$/i.test(name);

  if (isImage) {
    editorStore.addTab({ id: path, path, name, content: '', language: 'image', isPreview: false });
    editorStore.setActiveTab(path);
    return;
  }

  let content = '';
  let isLargeFile = false;
  let isPreview = false;

  try {
    content = await invoke<string>('read_file_text', { path });
  } catch (err) {
    if (String(err) === '__LARGE_FILE__') {
      content = '';
      isLargeFile = true;
      isPreview = true;
    } else {
      throw err;
    }
  }

  editorStore.addTab({
    id: path,
    path,
    name,
    content,
    language: isImage ? 'image' : await invoke<string>('detect_language', { path }),
    languageDetected: true,
    isPreview,
    isLargeFile
  });
  editorStore.setActiveTab(path);
}

export async function openFileForRunning() {
  const selected = await openDialog({ multiple: false });
  if (selected && typeof selected === 'string') {
    await openEditorTab(selected);
    await refreshRunConfigurations();
  }
}

function launchJsonPath(workspaceFolder: string) {
  return `${workspaceFolder}\\${LAUNCH_JSON_DIR}\\${LAUNCH_JSON_FILE}`;
}

/** True when the workspace has a .vscode/launch.json on disk. */
export async function hasLaunchJson(): Promise<boolean> {
  const root = getWorkspaceRoot();
  if (!root) return false;
  try {
    return await invoke<boolean>('file_exists', { path: launchJsonPath(root) });
  } catch {
    return false;
  }
}

let lastLaunchErrorSig: string | null = null;

async function readLaunchJson(workspaceFolder: string) {
  if (!workspaceFolder) return null;
  const launchPath = launchJsonPath(workspaceFolder);
  try {
    const raw = await invoke<string>('read_file_text', { path: launchPath });
    lastLaunchErrorSig = null;
    return { launchPath, raw };
  } catch {
    return null;
  }
}

async function hasCsprojIn(dir: string): Promise<boolean> {
  try {
    const node = await invoke<{ children?: { name: string }[] | null }>('read_directory', { path: dir, showDotFiles: false });
    return (node?.children ?? []).some(c => typeof c.name === 'string' && c.name.toLowerCase().endsWith('.csproj'));
  } catch {
    return false;
  }
}

async function currentFileConfig(activeFile: string): Promise<RunConfiguration | null> {
  const target = getRunTarget(activeFile);
  if (!target) return null;

  // C# needs a project file in scope for `dotnet run` to work.
  if (target.type === 'csharp' && !(await hasCsprojIn(dirname(activeFile)))) return null;

  return {
    name: `${target.label}: Current File`,
    type: target.type,
    request: 'launch',
    program: activeFile,
    cwd: dirname(activeFile),
    source: 'detected',
    detectedTier: 'active',
    currentFile: activeFile
  };
}

async function detectConfigurations(workspaceFolder: string, activeFile: string | null): Promise<RunConfiguration[]> {
  const configs: RunConfiguration[] = [];
  const launch = await readLaunchJson(workspaceFolder);

  if (launch) {
    try {
      const parsed = JSON.parse(stripJsonComments(launch.raw));
      const parsedConfigs = Array.isArray(parsed?.configurations) ? parsed.configurations : [];
      for (const item of parsedConfigs) {
        if (!item || typeof item !== 'object' || typeof item.name !== 'string' || typeof item.type !== 'string') continue;
        configs.push({
          name: item.name,
          type: item.type,
          request: item.request === 'attach' ? 'attach' : 'launch',
          program: typeof item.program === 'string' ? item.program : undefined,
          cwd: typeof item.cwd === 'string' ? item.cwd : undefined,
          args: normalizeToArray(item.args),
          runtimeExecutable: typeof item.runtimeExecutable === 'string' ? item.runtimeExecutable : undefined,
          runtimeArgs: normalizeToArray(item.runtimeArgs),
          url: typeof item.url === 'string' ? item.url : undefined,
          port: typeof item.port === 'number' ? item.port : undefined,
          env: item.env && typeof item.env === 'object'
            ? Object.fromEntries(Object.entries(item.env).map(([key, value]) => [key, String(value)]))
            : undefined,
          envFile: typeof item.envFile === 'string' ? item.envFile : undefined,
          pythonPath: typeof item.pythonPath === 'string' ? item.pythonPath : undefined,
          source: 'launch.json'
        });
      }
    } catch (err) {
      // Throttle: only toast when the error signature changes, so switching
      // tabs with a broken launch.json doesn't spam toasts.
      const sig = String(err);
      if (sig !== lastLaunchErrorSig) {
        lastLaunchErrorSig = sig;
        uiStore.addToast('launch.json invalid', 'alert', sig);
      }
    }
  } else {
    lastLaunchErrorSig = null;
  }

  // Entry point resolution engine (manifest → framework → heuristic).
  // Replaces the old hardcoded extension check: reads package.json / pyproject
  // BEFORE guessing filenames, so "src/index.js" is honored over a root one.
  const activeDir = activeFile ? dirname(activeFile) : undefined;
  const resolved = await resolveEntries(workspaceFolder, activeDir);
  const resolvedConfigs = resolved.map(entryToRunConfig);

  // For Python we can pin the venv interpreter for the *manifest* entries so
  // the program runs in the same environment the developer uses.
  const pythonEntries = resolved.filter(e => e.type === 'python' && e.program);
  if (pythonEntries.length > 0) {
    const py = await resolvePythonInterpreter(workspaceFolder);
    if (py !== 'python') {
      for (const cfg of resolvedConfigs) {
        if (cfg.type === 'python') cfg.pythonPath = py;
      }
    }
  }

  // Workspace task providers (npm, cargo, ...) contribute runnable entries as
  // data, so "Run" is not limited to manifest-detected entry points and the
  // run service never hardcodes a project layout.
  const taskConfigs: RunConfiguration[] = [];
  if (workspaceFolder) {
    const tasks = await taskRegistry.provideAll(workspaceFolder).catch(() => []);
    for (const task of tasks) {
      taskConfigs.push({
        name: task.label,
        type: 'task',
        request: 'launch',
        command: [task.command, ...(task.args ?? [])].join(' '),
        cwd: task.cwd || workspaceFolder,
        source: 'detected',
        detectedTier: 'manifest'
      });
    }
  }

  // Active file fallback (registry-driven: covers every registered
  // language, not just the previous js/ts/py/go/rb list).
  const currentFileConfigs: RunConfiguration[] = [];
  if (activeFile) {
    const cfg = await currentFileConfig(activeFile);
    // Pin the project's venv interpreter for Python current-file runs so
    // they execute in the same environment as detected/launch.json runs.
    if (cfg && cfg.type === 'python') {
      const py = await resolvePythonInterpreter(workspaceFolder);
      if (py !== 'python') cfg.pythonPath = py;
    }
    if (cfg) currentFileConfigs.push(cfg);
  }

  // Confidence order: launch.json (explicit) → engine (manifest /
  // framework / heuristic) → "Current File" fallback. Dedup by (type + program)
  // while never collapsing framework dev-servers that have no program file.
  const ordered = [...configs, ...resolvedConfigs, ...taskConfigs, ...currentFileConfigs];
  return ordered.filter((cfg, i, arr) => {
    if (!cfg.program || cfg.currentFile) return true;
    const sig = `${cfg.type}|${cfg.program}`;
    // keep the first occurrence → launch.json/manifest precedence is preserved.
    return arr.findIndex(c => `${c.type}|${c.program}` === sig) === i;
  });
}

export async function refreshRunConfigurations() {
  const workspaceFolder = getWorkspaceRoot();
  const activeFile = getActiveFilePath();
  const configurations = await detectConfigurations(workspaceFolder, activeFile);
  runStore.setConfigurations(configurations);
  return configurations;
}

export async function createLaunchJsonFile() {
  const workspaceFolder = getWorkspaceRoot();
  if (!workspaceFolder) {
    uiStore.addToast('Open a workspace first', 'alert');
    return;
  }

  const vsCodeDir = `${workspaceFolder}\\${LAUNCH_JSON_DIR}`;
  const launchPath = `${vsCodeDir}\\${LAUNCH_JSON_FILE}`;
  const activeFile = getActiveFilePath();
  const template = `{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Program",
      "program": "${activeFile ? '${file}' : '${workspaceFolder}\\\\index.js'}",
      "cwd": "${'${workspaceFolder}'}",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
`;

  try {
    await invoke('create_directory', { path: vsCodeDir }).catch(() => {});
    await invoke('save_file', { path: launchPath, content: template });
    await openEditorTab(launchPath);
    uiStore.addToast('launch.json created', 'success');
    await refreshRunConfigurations();
  } catch (err) {
    uiStore.addToast('Failed to create launch.json', 'alert', String(err));
  }
}

/** Open the workspace's launch.json in an editor tab (creating nothing). */
export async function openLaunchJson() {
  const root = getWorkspaceRoot();
  if (!root) return;
  const path = launchJsonPath(root);
  try {
    if (await invoke<boolean>('file_exists', { path })) {
      await openEditorTab(path);
    }
  } catch {
    /* ignore */
  }
}

/**
 * "Save as launch configuration": lift an auto-detected entry point
 * into an explicit launch.json entry so the heuristic can never be re-guessed.
 */
export async function saveResolvedEntryAsConfig(entry: ResolvedEntry) {
  const workspaceFolder = getWorkspaceRoot();
  if (!workspaceFolder) {
    uiStore.addToast('Open a workspace first', 'alert');
    return;
  }

  const vsCodeDir = `${workspaceFolder}\\${LAUNCH_JSON_DIR}`;
  const launchPath = `${vsCodeDir}\\${LAUNCH_JSON_FILE}`;
  const program = entry.program || '${workspaceFolder}\\index.js';
  const type = entry.type;

  const current = await readLaunchJson(workspaceFolder);
  let configurations: any[];
  if (current) {
    try {
      configurations = JSON.parse(stripJsonComments(current.raw)).configurations || [];
    } catch {
      configurations = [];
    }
  } else {
    configurations = [];
  }

  if (!configurations.some(c => c && c.program === program && c.type === type)) {
    const entryCfg: Record<string, unknown> = {
      type,
      request: 'launch',
      name: entry.name,
      program,
      cwd: entry.cwd || '${workspaceFolder}'
    };
    // Preserve framework dev-server commands so they stay runnable.
    if (entry.command) entryCfg['runtimeExecutable'] = entry.command;
    configurations.push(entryCfg);
  }

  const body = {
    version: '0.2.0',
    configurations
  };

  try {
    await invoke('create_directory', { path: vsCodeDir }).catch(() => {});
    await invoke('save_file', { path: launchPath, content: JSON.stringify(body, null, 2) });
    uiStore.addToast(`${entry.name} saved to launch.json`, 'success');
    await refreshRunConfigurations();
  } catch (err) {
    uiStore.addToast('Failed to save configuration', 'alert', String(err));
  }
}

/** KEY=VALUE pairs from a .env file (comments, `export`, quotes tolerated). */
function parseDotEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    let key = trimmed.slice(0, eq).trim();
    if (key.startsWith('export ')) key = key.slice(7).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

interface TerminalPlan {
  cwd: string;
  label: string;
  /** Shell statements executed sequentially in the spawned terminal. */
  statements: string[];
  env?: Record<string, string>;
}

/**
 * The shell type Run spawns and the statement dialect it expects.
 * Follows the user's default-shell preference when it exists on this OS,
 * otherwise the platform's first choice (Windows → PowerShell, else bash).
 */
function runShellType(): ReturnType<typeof getPlatformDefaultShell> {
  const platformShells = getPlatformShells();
  const preferred = settingsStore.effectiveSettings.default_shell;
  return platformShells.includes(preferred) ? preferred : getPlatformDefaultShell();
}

function runShellDialect(): ShellDialect {
  return getPlatformDefaultShell() === 'powershell' ? 'powershell' : 'posix';
}

/**
 * Render argv as one shell line. Tokens with spaces/quotes become quoted
 * literals; bare flags pass through. PowerShell executes quoted paths only
 * through the call operator, so a quoted head token gets an `& ` prefix.
 */
function joinCommand(shell: ShellDialect, parts: string[]) {
  const needsQuote = (p: string) => /[\s"']/.test(p);
  const rendered = parts.filter(p => p !== '').map(p => (needsQuote(p) ? quoteFor(shell, p) : p));
  const head = rendered[0] ?? '';
  const prefix = shell === 'powershell' && needsQuote(head) ? '& ' : '';
  return prefix + rendered.join(' ');
}

function buildTerminalCommand(input: RunConfiguration): TerminalPlan | { unsupported: string } {
  const workspaceFolder = getWorkspaceRoot();
  const activeFile = getActiveFilePath();
  const resolved = resolveConfiguration(input, workspaceFolder, activeFile);
  const args = [...(resolved.args || [])];
  // Statements are emitted for the shell that will actually host the run.
  const shell = runShellDialect();

  if (resolved.request === 'attach') {
    return { unsupported: `Attach request is not supported yet for "${resolved.name}".` };
  }

  // Standalone current-file runs go through the run-target registry — one
  // table decides every supported language. Interpreter overrides (venv
  // python, custom ruby) are forwarded from the configuration.
  if (resolved.currentFile) {
    const override =
      resolved.type === 'python' ? resolved.pythonPath :
      resolved.type === 'ruby' ? resolved.rubyPath :
      undefined;
    const statements = buildStandaloneStatements(resolved.type, resolved.currentFile, { executable: override, shell });
    if (!statements) {
      return { unsupported: `"${resolved.type}" files cannot be run standalone on this platform.` };
    }
    return { cwd: resolved.cwd || dirname(resolved.currentFile), label: resolved.name, statements };
  }

  // Framework dev-server entries carry a package-manager-aware `command`
  // hint the resolver produced (e.g. "npm run dev", "npx --no-install vite").
  // Their `program` may be empty — run the command directly in the terminal.
  if (input.command) {
    return {
      cwd: resolved.cwd || workspaceFolder,
      label: resolved.name,
      statements: [input.command]
    };
  }

  // Runtime dispatch goes through the Run provider registry — each runtime is
  // one provider, so adding a language never edits this function.
  const provider = runProviderRegistry.getForType(resolved.type);
  if (provider) {
    const result = provider.build(resolved, args, {
      shell,
      workspaceFolder,
      activeFile,
      joinCommand: (parts) => joinCommand(shell, parts)
    });
    if (result) {
      if ('unsupported' in result) return result;
      return {
        cwd: result.cwd || workspaceFolder,
        label: result.label,
        statements: result.statements
      };
    }
  }

  return {
    unsupported: `Configuration type "${resolved.type}" is not supported by Notron yet.`
  };
}

/** Human-readable preview of what a configuration will execute. */
export function getRunPreview(config: RunConfiguration): string {
  const built = buildTerminalCommand(config);
  if ('unsupported' in built) return built.unsupported;
  const envPart = built.env && Object.keys(built.env).length > 0 ? '[env] ' : '';
  return `${envPart}${built.statements.join(' ; ')}`;
}

// Terminal lifecycle: one terminal per config, rerun replaces, stop kills

/** label → terminal id of the most recent run for that configuration. */
const runTerminals = new Map<string, string>();

function findTerminal(id: string | undefined) {
  if (!id) return undefined;
  return terminalStore.getSnapshot().terminals.find(t => t.id === id);
}

function launchInTerminal(plan: TerminalPlan, env?: Record<string, string>) {
  // the editor semantics: rerunning a configuration replaces its previous
  // session instead of stacking terminals.
  const prevId = runTerminals.get(plan.label);
  if (prevId) {
    terminalStore.killProcess(prevId);
    terminalStore.closeTerminal(prevId);
  }

  const initialCommand = plan.statements.join('\r\n') + '\r\n';
  const id = terminalStore.newTerminal(runShellType(), plan.cwd, {
    initialCommand,
    name: `${RUN_TERMINAL_PREFIX}: ${plan.label}`,
    exactName: true,
    env
  });
  runTerminals.set(plan.label, id);
  terminalStore.setActivePanel('terminal');
  runStore.setLastRunLabel(plan.label);
}

function killAllRunTerminals(): number {
  let killed = 0;
  for (const [label, id] of [...runTerminals.entries()]) {
    if (findTerminal(id)) {
      terminalStore.killProcess(id);
      terminalStore.closeTerminal(id);
      killed++;
    }
    runTerminals.delete(label);
  }
  return killed;
}

/** True while at least one Run-spawned terminal is still alive. */
export function hasActiveRuns(): boolean {
  for (const id of runTerminals.values()) {
    if (findTerminal(id)) return true;
  }
  return false;
}

/** Terminal ids currently owned by Run (for reactive UI checks). */
export function activeRunTerminalIds(): string[] {
  const ids: string[] = [];
  for (const [label, id] of runTerminals.entries()) {
    if (findTerminal(id)) ids.push(id);
    else runTerminals.delete(label);
  }
  return ids;
}

/** Stop every running configuration started from Notron. */
export async function stopActiveRuns() {
  const killed = killAllRunTerminals();
  if (killed > 0) {
    uiStore.setStatus(killed === 1 ? 'Run stopped' : `${killed} runs stopped`, RUN_STATUS_MS);
  } else {
    uiStore.setStatus('No running process', RUN_STATUS_MS);
  }
  return killed;
}

async function executePlan(input: RunConfiguration) {
  const workspaceFolder = getWorkspaceRoot();

  // Resolve envFile (async read) then merge with inline env — inline wins.
  let env: Record<string, string> | undefined;
  const snapshot = resolveConfiguration(input, workspaceFolder, getActiveFilePath());
  if (snapshot.envFile) {
    const base = snapshot.cwd || workspaceFolder;
    const normalized = snapshot.envFile.replace(/^\.\?[\\/]/, '').replace(/\//g, '\\');
    const path = /^([A-Za-z]:[\\/])/.test(normalized) ? normalized : `${base}\\${normalized}`;
    try {
      const raw = await invoke<string>('read_file_text', { path });
      env = { ...parseDotEnv(raw), ...(snapshot.env || {}) };
    } catch {
      if (snapshot.env) env = { ...snapshot.env };
      uiStore.addToast(`envFile not found: ${basename(snapshot.envFile)}`, 'alert');
    }
  } else if (snapshot.env) {
    env = { ...snapshot.env };
  }

  const built = buildTerminalCommand(input);
  if ('unsupported' in built) {
    uiStore.addToast('Run not available', 'alert', built.unsupported);
    return false;
  }

  launchInTerminal(built, env);
  uiStore.setStatus(`Running ${built.label}`, RUN_STATUS_MS);
  return true;
}

export async function runSelectedConfiguration() {
  const workspaceFolder = getWorkspaceRoot();

  if (!workspaceFolder) {
    uiStore.addToast('Open a workspace first', 'alert');
    return;
  }

  const snapshot = get(runStore);
  if (snapshot.configurations.length === 0) {
    await refreshRunConfigurations();
  }

  const latest = get(runStore);
  const selected = latest.configurations.find(c => c.name === latest.selectedConfigurationName) || latest.configurations[0];
  if (!selected) {
    uiStore.addToast('No configuration found', 'alert', 'Open a runnable file or create a launch.json first.');
    return;
  }

  await executePlan(selected);
}

/** Run the active editor file directly (the editor "Run Current File"). */
export async function runCurrentFile() {
  const workspaceFolder = getWorkspaceRoot();
  if (!workspaceFolder) {
    uiStore.addToast('Open a workspace first', 'alert');
    return;
  }

  const activeFile = getActiveFilePath();
  if (!activeFile) {
    uiStore.addToast('No runnable file is open', 'alert', 'Open a file first.');
    return;
  }

  if (!isRunnableFile(activeFile)) {
    uiStore.addToast('Cannot run this file', 'alert', `No runner registered for "${basename(activeFile)}".`);
    return;
  }

  const cfg = await currentFileConfig(activeFile);
  if (!cfg) {
    uiStore.addToast('Cannot run this file', 'alert', 'This C# file has no .csproj next to it.');
    return;
  }

  await executePlan(cfg);
}
