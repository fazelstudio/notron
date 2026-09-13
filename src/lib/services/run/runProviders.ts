/**
 * Built-in Run Providers
 *
 * One provider per runtime. The run service dispatches to these by
 * configuration type instead of branching on runtime names inline.
 * To support a new runtime, register a provider here (or from a contrib).
 */

import { runProviderRegistry, type RunProviderContext, type RunProviderResult } from '../../workbench/runRegistry';
import type { RunConfiguration } from '../../stores/run';

function unsupported(name: string, reason: string): RunProviderResult {
  return { unsupported: `Configuration "${name}" ${reason}.` };
}

/** node / pwa-node / node-terminal — direct runtime or a pure command config. */
function buildNode(resolved: RunConfiguration, args: string[], ctx: RunProviderContext): RunProviderResult {
  const cwd = resolved.cwd || ctx.workspaceFolder;
  // A pure command config ("npm run dev" via runtimeExecutable) is valid.
  // Without a program field.
  if (!resolved.program && resolved.runtimeExecutable) {
    return {
      cwd,
      label: resolved.name,
      statements: [ctx.joinCommand([resolved.runtimeExecutable, ...(resolved.runtimeArgs || []), ...args])]
    };
  }
  if (!resolved.program) return unsupported(resolved.name, 'does not define a program');
  return {
    cwd,
    label: resolved.name,
    statements: [
      ctx.joinCommand([
        resolved.runtimeExecutable || 'node',
        ...(resolved.runtimeArgs || []),
        resolved.program,
        ...args
      ])
    ]
  };
}

/** python / debugpy — prefers an explicit runtime, then the detected venv. */
function buildPython(resolved: RunConfiguration, args: string[], ctx: RunProviderContext): RunProviderResult {
  if (!resolved.program) return unsupported(resolved.name, 'does not define a program');
  const executable = resolved.runtimeExecutable || resolved.pythonPath || 'python';
  return {
    cwd: resolved.cwd || ctx.workspaceFolder,
    label: resolved.name,
    statements: [ctx.joinCommand([executable, resolved.program, ...args])]
  };
}

/** go — compiles the selected program. */
function buildGo(resolved: RunConfiguration, args: string[], ctx: RunProviderContext): RunProviderResult {
  if (!resolved.program) return unsupported(resolved.name, 'does not define a program');
  return {
    cwd: resolved.cwd || ctx.workspaceFolder,
    label: resolved.name,
    statements: [ctx.joinCommand(['go', 'run', resolved.program, ...args])]
  };
}

/** ruby / rdbg — prefers a custom ruby interpreter when provided. */
function buildRuby(resolved: RunConfiguration, args: string[], ctx: RunProviderContext): RunProviderResult {
  if (!resolved.program) return unsupported(resolved.name, 'does not define a program');
  const executable = resolved.runtimeExecutable || resolved.rubyPath || 'ruby';
  return {
    cwd: resolved.cwd || ctx.workspaceFolder,
    label: resolved.name,
    statements: [ctx.joinCommand([executable, resolved.program, ...args])]
  };
}

runProviderRegistry.registerAll([
  { id: 'node', label: 'Node.js', types: ['node', 'pwa-node', 'node-terminal'], priority: 10, build: buildNode },
  { id: 'python', label: 'Python', types: ['python', 'debugpy'], priority: 20, build: buildPython },
  { id: 'go', label: 'Go', types: ['go'], priority: 30, build: buildGo },
  { id: 'ruby', label: 'Ruby', types: ['ruby', 'rdbg'], priority: 40, build: buildRuby },
  {
    id: 'rust',
    label: 'Rust',
    types: ['rust'],
    priority: 50,
    build: (resolved, args, ctx) => ({
      cwd: resolved.cwd || ctx.workspaceFolder,
      label: resolved.name,
      statements: [ctx.joinCommand(['cargo', 'run', ...args])]
    })
  },
  {
    id: 'deno',
    label: 'Deno',
    types: ['deno'],
    priority: 60,
    build: (resolved, args, ctx) => {
      if (!resolved.program) return unsupported(resolved.name, 'does not define a program');
      return {
        cwd: resolved.cwd || ctx.workspaceFolder,
        label: resolved.name,
        statements: [ctx.joinCommand(['deno', 'run', resolved.program, ...args])]
      };
    }
  },
  {
    id: 'browser',
    label: 'Browser',
    types: ['chrome', 'pwa-chrome'],
    priority: 70,
    build: () => ({
      unsupported: `Browser URL launch is not wired yet. Edit launch.json to configure the URL.`
    })
  }
]);
