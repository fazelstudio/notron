/**
 * treeFlattener.ts
 *
 * Converts a nested file tree into a flat array for virtual scrolling.
 * Virtual lists can only work on flat arrays, NOT on nested structures.
 *
 * Golden Rule: flatten the tree into a linear array BEFORE virtualizing.
 */

export interface FlatTreeNode {
  /** Unique identifier — same as path */
  path: string;
  /** Display name */
  name: string;
  /** Indentation level (0 = root children) */
  depth: number;
  /** Whether this is a directory */
  is_dir: boolean;
  /** Whether this directory is expanded (only meaningful if is_dir) */
  isExpanded: boolean;
  /** Whether this directory has children (determines expand arrow) */
  has_children: boolean;
  /** True when this entry is gitignored — shown but dimmed like the editor. */
  is_ignored?: boolean;
  /** Is this a temporary node for the creation input? */
  is_creating?: boolean;
  /** Type of item being created */
  creating_type?: 'file' | 'folder';
}

export interface RawFileNode {
  name: string;
  path: string;
  is_dir: boolean;
  has_children?: boolean;
  children?: RawFileNode[];
  /** True when matched by .gitignore — shown but dimmed like the editor. */
  is_ignored?: boolean;
}

/**
 * Perform a DFS traversal of the file tree and produce a flat array
 * of ONLY the visible nodes, based on the current set of expanded paths.
 *
 * This is the core tree-flattening function.
 *
 * PERF: intentionally no loadingPaths parameter.
 * Previously it was passed here, making loadingPaths a dependency of flatList.
 * Every loading state change (add/remove path) triggered a full tree recompute.
 * Now loadingPaths is consumed directly by TreeNode via isLoading prop,
 * completely decoupled from flatList computation.
 *
 * @param nodes      - Array of top-level nodes (root's children)
 * @param expandedSet - Set of paths that are currently expanded
 * @param childrenCache - Map from path → loaded children (node cache)
 * @param depth      - Current recursion depth (starts at 0)
 * @param creatingItem - Optional item being created inline
 * @returns Flat array of visible nodes, ready for virtual scrolling
 */
export function flattenTree(
  nodes: RawFileNode[],
  expandedSet: Set<string>,
  childrenCache: Map<string, RawFileNode[]>,
  depth = 0,
  creatingItem?: { type: 'file' | 'folder'; parentPath: string } | null,
): FlatTreeNode[] {
  const result: FlatTreeNode[] = [];

  for (const node of nodes) {
    const isExpanded = node.is_dir && expandedSet.has(node.path);
    const has_children = node.has_children ?? (node.children ? node.children.length > 0 : false);

    result.push({
      path: node.path,
      name: node.name,
      depth,
      is_dir: node.is_dir,
      isExpanded,
      has_children,
      is_ignored: node.is_ignored,
    });

    if (isExpanded) {
      const children = childrenCache.get(node.path) ?? node.children ?? [];
      const childFlat = flattenTree(children, expandedSet, childrenCache, depth + 1, creatingItem);

      if (creatingItem && creatingItem.parentPath === node.path) {
        if (creatingItem.type === 'folder') {
          childFlat.unshift({
            path: '__creating_input__',
            name: '',
            depth: depth + 1,
            is_dir: true,
            isExpanded: false,
            has_children: false,
            is_creating: true,
            creating_type: 'folder'
          });
        } else {
          let insertIndex = 0;
          while (insertIndex < childFlat.length && childFlat[insertIndex].is_dir && !childFlat[insertIndex].is_creating) {
            insertIndex++;
          }
          childFlat.splice(insertIndex, 0, {
            path: '__creating_input__',
            name: '',
            depth: depth + 1,
            is_dir: false,
            isExpanded: false,
            has_children: false,
            is_creating: true,
            creating_type: 'file'
          });
        }
      }

      for (const c of childFlat) result.push(c);
    }
  }

  return result;
}

/**
 * Sort nodes: directories first, then alphabetical by name (case-insensitive).
 */
export function sortNodes(nodes: RawFileNode[]): RawFileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}
