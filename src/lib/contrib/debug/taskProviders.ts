/**
 * Built-in Task Providers
 *
 * Each project type contributes its runnable tasks as data, so the Run panel
 * shows build/test/run entries without the run service hardcoding a project
 * layout. Mirrors the editor's Task Provider contribution point.
 */

import { taskRegistry, type TaskDefinition } from '../../workbench/taskRegistry';
import { fileService } from '../../services/fileService';

/** Join a workspace-relative file onto the workspace root. */
function workspaceFile(root: string, name: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root}${sep}${name}`;
}

async function readWorkspaceFile(root: string, name: string): Promise<string | null> {
  try {
    return await fileService.readText(workspaceFile(root, name));
  } catch {
    return null;
  }
}

// Npm / bun / yarn scripts — declared in package.json, one task per script.
taskRegistry.register({
  id: 'npm',
  label: 'npm',
  priority: 10,
  provideTasks: async (workspaceRoot: string): Promise<TaskDefinition[]> => {
    const raw = await readWorkspaceFile(workspaceRoot, 'package.json');
    if (!raw) return [];
    let scripts: Record<string, string> = {};
    try {
      scripts = JSON.parse(raw)?.scripts ?? {};
    } catch {
      return [];
    }
    return Object.keys(scripts).map((name) => ({
      id: `npm:${name}`,
      label: `npm: ${name}`,
      group: name === 'test' ? 'test' : name === 'build' ? 'build' : 'none',
      command: `npm run ${name}`,
      cwd: workspaceRoot
    }));
  }
});

// Cargo — fixed task set once Cargo.toml exists.
taskRegistry.register({
  id: 'cargo',
  label: 'Cargo',
  priority: 20,
  provideTasks: async (workspaceRoot: string): Promise<TaskDefinition[]> => {
    const raw = await readWorkspaceFile(workspaceRoot, 'Cargo.toml');
    if (!raw) return [];
    return [
      { id: 'cargo:build', label: 'cargo: build', group: 'build', command: 'cargo build', cwd: workspaceRoot },
      { id: 'cargo:test', label: 'cargo: test', group: 'test', command: 'cargo test', cwd: workspaceRoot },
      { id: 'cargo:run', label: 'cargo: run', group: 'none', command: 'cargo run', cwd: workspaceRoot }
    ];
  }
});
