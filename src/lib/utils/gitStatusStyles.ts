/**
 * Git status color helpers, shared by the file tree, source control panel
 * and any other surface that decorates files with their git state.
 *
 * Colors follow DECO-001 semantic palette:
 *   Conflict = accent/red, Deleted = error/red,
 *   Modified/Renamed = warning/yellow, Added = success/green,
 *   Untracked = teal, Ignored = dimmed foreground.
 */

function statusTone(code: string | undefined): 'conflict' | 'deleted' | 'modified' | 'added' | 'untracked' | 'ignored' | 'muted' {
  if (!code) return 'muted';
  if (code === 'Conflict') return 'conflict';
  if (code === 'D') return 'deleted';
  if (code === 'M' || code === 'R') return 'modified';
  if (code === 'A' || code === 'C') return 'added';
  if (code === 'U') return 'untracked';
  if (code === 'Ignored') return 'ignored';
  return 'muted';
}

const TONE_COLOR: Record<string, string> = {
  conflict: 'var(--color-error)',
  deleted: 'var(--color-error)',
  modified: 'var(--color-warning)',
  added: 'var(--color-success)',
  untracked: 'var(--color-untracked)',
  ignored: 'var(--color-text-ignored, #5a5a5a)',
  muted: 'var(--text-muted)',
};

/** Color of the git status badge/label for the given status code. */
export function getGitStatusStyle(code: string | undefined): string {
  return `color: ${TONE_COLOR[statusTone(code)]}`;
}

/**
 * Badge style. When `isRollup` is true (a folder showing the worst status
 * inside it), the badge is rendered as a pill and needs a border color too.
 */
export function getGitBadgeStyle(code: string | undefined, isRollup = false): string {
  const color = TONE_COLOR[statusTone(code)];
  return isRollup ? `border-color: ${color}; color: ${color}` : `color: ${color}`;
}

/** Color of a file row inside an expanded commit's file list. */
export function getExpandedFileStatusStyle(code: string): string {
  if (code === 'M') return 'color: var(--color-warning)';
  if (code === 'A') return 'color: var(--color-success)';
  if (code === 'D') return 'color: var(--color-error)';
  return 'color: var(--text-primary)';
}

/** Single-character badge shown next to a file: '!' for conflicts, the code otherwise. */
export function getGitStatusBadgeChar(code: string | undefined): string {
  return code === 'Conflict' ? '!' : code ?? '';
}

/**
 * DECO-002: Dedicated dim style for ignored files/folders.
 * Uses a specific foreground color rather than generic opacity,
 * ensuring clear visual distinction from normal text.
 */
export function getIgnoredStyle(): string {
  return 'color: var(--color-text-ignored, #5a5a5a)';
}

/**
 * DECO-005: Human-readable tooltip for git status codes.
 * Format: "filename - Status" (matches VSCode behavior).
 * For folder rollups: "folder - Contains [status] items" or "folder - Contains emphasized items".
 * If symlinkTarget is provided, shows "filename - Symbolic Link to target".
 */
export function getGitStatusTooltip(
  code: string | undefined,
  fileName: string,
  renamedFrom?: string,
  symlinkTarget?: string,
  isRollup = false
): string {
  if (!code) return fileName;

  // Symlink takes priority in display
  if (symlinkTarget) {
    return `${fileName} - Symbolic Link to ${symlinkTarget}`;
  }

  // VSCode-style folder rollup tooltip
  if (isRollup) {
    let statusDescription: string;
    switch (code) {
      case 'M': statusDescription = 'modified'; break;
      case 'A': statusDescription = 'added'; break;
      case 'U': statusDescription = 'untracked'; break;
      case 'D': statusDescription = 'deleted'; break;
      case 'R': statusDescription = 'renamed'; break;
      case 'C': statusDescription = 'copied'; break;
      case 'Conflict': statusDescription = 'conflicted'; break;
      default: statusDescription = 'changed';
    }
    return `${fileName} - Contains ${statusDescription} items`;
  }

  let status: string;
  switch (code) {
    case 'M': status = 'Modified'; break;
    case 'A': status = 'Added'; break;
    case 'U': status = 'Untracked'; break;
    case 'D': status = 'Deleted'; break;
    case 'R': status = renamedFrom ? `Renamed from ${renamedFrom.split(/[/\\]/).pop()}` : 'Renamed'; break;
    case 'C': status = 'Copied'; break;
    case 'Conflict': status = 'Conflicted — resolve required'; break;
    case 'Ignored': status = 'Ignored by .gitignore'; break;
    default: status = code;
  }

  return `${fileName} - ${status}`;
}
