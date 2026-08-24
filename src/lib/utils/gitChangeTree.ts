/**
 * gitChangeTree.ts
 *
 * Builders for the Source Control "View as Tree" modes:
 *  - `buildChangeTree`: group `GitFileStatus[]` rows under folder nodes
 *    (folders first, then files, alphabetical — like the Explorer).
 *  - `buildGraphGroups`: group `GitLogEntry[]` commits under their branch/ref
 *    header (HEAD-marked ref wins, fallback first ref, then "No Branch").
 * Single source of truth for both tree structures.
 */

import type { GitFileStatus, GitLogEntry } from '../services/git';

export interface ChangeTreeNode {
  type: 'folder' | 'file';
  name: string;
  /** Folder: dir path (e.g. "src/components"). File: full relative path. */
  path: string;
  file?: GitFileStatus;
  /** Files directly under this folder (for the folder badge count). */
  count: number;
  children: ChangeTreeNode[];
}

const sortNodes = (nodes: ChangeTreeNode[]): ChangeTreeNode[] =>
  [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

/**
 * Fold a flat list of status rows into a folder tree. Files without a parent
 * directory end up at the root level.
 */
export function buildChangeTree(files: GitFileStatus[]): ChangeTreeNode[] {
  const byDir = new Map<string, ChangeTreeNode[]>();

  const ensureDir = (dir: string): ChangeTreeNode[] => {
    let list = byDir.get(dir);
    if (!list) {
      list = [];
      byDir.set(dir, list);
    }
    return list;
  };

  for (const file of files) {
    const parts = file.path.split('/');
    const fileName = parts.pop() ?? file.path;

    let dir = '';
    let siblings = ensureDir('');
    for (let i = 0; i < parts.length; i++) {
      dir = dir ? `${dir}/${parts[i]}` : parts[i];
      const list = ensureDir(dir);
      const folder = siblings.find((n) => n.type === 'folder' && n.path === dir);
      if (!folder) {
        siblings.push({ type: 'folder', name: parts[i], path: dir, count: 0, children: list });
      }
      siblings = list;
    }

    siblings.push({ type: 'file', name: fileName, path: file.path, file, count: 0, children: [] });
  }

  // Count files per folder (subtree total, folders included as nodes).
  const countTree = (nodes: ChangeTreeNode[]): number => {
    let total = 0;
    for (const n of nodes) {
      if (n.type === 'file') total += 1;
      else {
        const c = countTree(n.children);
        n.count = c;
        total += c;
      }
    }
    return total;
  };

  const root = sortNodes(ensureDir(''));
  countTree(root);
  for (const level of byDir.values()) {
    const sorted = sortNodes(level);
    level.splice(0, level.length, ...sorted);
  }
  return root;
}

export interface GraphGroup {
  name: string;
  commits: GitLogEntry[];
}

/** Pick the branch/ref label a commit belongs to (HEAD-marked ref wins).
 *  Commits with no refs at all (an ancestor whose descendant branch tip holds
 *  the ref) fall back to the `defaultLabel` — normally the repo's current
 *  branch — so a single-branch repo shows everything under ONE header instead
 *  of a phantom "No Branch" group. */
export function groupLabelForCommit(commit: GitLogEntry, defaultLabel?: string): string {
  const refs = commit.refs.split(',').map((r) => r.trim()).filter(Boolean);
  if (refs.length === 0) return defaultLabel || 'No Branch';
  const headRef = refs.find((r) => r.includes('->'));
  if (headRef) {
    const name = headRef.split('->')[1].trim().replace(/^tag:\s*/, '');
    if (name) return name;
  }
  return refs[0].replace(/^tag:\s*/, '');
}

/** Group commits under branch/ref headers, preserving commit order within each
 *  group. Pass the repo's HEAD branch as `defaultLabel` so ref-less ancestors
 *  stay under the same group instead of falling into "No Branch". */
export function buildGraphGroups(commits: GitLogEntry[], defaultLabel?: string): GraphGroup[] {
  const groups = new Map<string, GitLogEntry[]>();
  for (const commit of commits) {
    const label = groupLabelForCommit(commit, defaultLabel);
    const list = groups.get(label) ?? [];
    list.push(commit);
    groups.set(label, list);
  }
  return Array.from(groups.entries()).map(([name, list]) => ({ name, commits: list }));
}