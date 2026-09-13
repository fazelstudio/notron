/**
 * Explorer
 *
 * Utility helpers for explorer.
 */

export type ClipboardOp = 'copy' | 'cut' | null;
export type CreatingType = 'file' | 'folder' | null;
export type ConflictStrategy = 'skip' | 'replace' | 'rename' | 'cancel';

export interface DragState {
  active: boolean;
  paths: string[];
  ghostX: number;
  ghostY: number;
  dropTargetPath: string | null;
  dropTargetValid: boolean;
  autoExpandTimer: ReturnType<typeof setTimeout> | null;
}

export interface MenuItem {
  label: string;
  action: () => void;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

export interface UndoEntry {
  type: 'move' | 'copy' | 'delete' | 'rename' | 'create';
  payload: Record<string, any>;
}

export const MAX_UNDO = 20;
export const DRAG_THRESHOLD_PX = 5;

export function getParentPath(path: string): string {
  const sep = path.includes('\\') ? '\\' : '/';
  const parts = path.split(/[/\\]/);
  parts.pop();
  return parts.join(sep) || path;
}

export function getFileName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || '';
}

export function getFileExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1) : '';
}

// Accepts either a Map (O(1)) or array (O(n)) for backward compatibility.
// FileTree passes flatListMap for O(1) lookups.
export function isDir(path: string, flatListOrMap: { path: string; is_dir: boolean }[] | Map<string, { path: string; is_dir: boolean }>): boolean {
  if (flatListOrMap instanceof Map) {
    return flatListOrMap.get(path)?.is_dir ?? false;
  }
  return flatListOrMap.find(n => n.path === path)?.is_dir ?? false;
}


export function isValidFileName(name: string): boolean {
  if (!name.trim()) return false;
  if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) return false;
  if (name === '.' || name === '..') return false;
  return true;
}

export function humanizeError(err: unknown): string {
  const msg = String(err).toLowerCase();
  if (msg.includes('no space') || msg.includes('disk full')) return 'Disk is full';
  if (msg.includes('permission') || msg.includes('access denied')) return 'Permission denied';
  if (msg.includes('not found') || msg.includes('no such file')) return 'File not found';
  if (msg.includes('busy') || msg.includes('locked')) return 'File is in use';
  if (msg.includes('network') || msg.includes('connection')) return 'Network error';
  return String(err);
}

export function getBoundedPos(x: number, y: number, menuWidth = 200, menuHeight = 300) {
  return {
    x: Math.min(x, window.innerWidth - menuWidth - 8),
    y: Math.min(y, window.innerHeight - menuHeight - 8),
  };
}
