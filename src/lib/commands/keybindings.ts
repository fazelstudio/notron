/**
 * Keybinding Registry
 *
 * Default keybindings that map keys to command ids.
 * Add a new shortcut by adding one entry here.
 */

import { commandRegistry } from './registry';

export interface Keybinding {
  /** Command ID to execute (must exist in commandRegistry) */
  command: string;
  /** Primary key, e.g. `p`, `F5`, `ArrowLeft` */
  key: string;
  /** Modifier flags */
  ctrlOrCmd?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** When false, matcher checks `!e.ctrlKey && !e.metaKey`; when undefined, don't care */
  ctrlOrCmdRequired?: boolean;
  /** Chord prefix, e.g. `Ctrl+K` for Ctrl+K → Ctrl+W */
  chord?: string | null;
  /** Prevent browser default when matched */
  preventDefault?: boolean;
 /** Weight/priority — higher wins when multiple match (additional multi-binding) */
  when?: () => boolean;
}

/** Default keybindings — centralized map: keys → command ID (never → handler). */
export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  // File
  { command: 'workbench.action.files.newUntitledFile', key: 'n', ctrlOrCmd: true, shift: false, chord: null },
  { command: 'workbench.action.newWindow', key: 'n', ctrlOrCmd: true, shift: true },
  { command: 'workbench.action.files.openFile', key: 'o', ctrlOrCmd: true },
  { command: 'workbench.action.files.openFolder', key: 'k', ctrlOrCmd: true, chord: null },
  { command: 'workbench.action.closeActiveEditor', key: 'w', ctrlOrCmd: true, chord: null },
  { command: 'workbench.action.closeActiveEditor', key: 'F4', ctrlOrCmd: true },
  { command: 'workbench.action.reopenClosedEditor', key: 't', ctrlOrCmd: true, shift: true },
  { command: 'workbench.action.files.save', key: 's', ctrlOrCmd: true, shift: false },
  { command: 'workbench.action.files.saveAs', key: 's', ctrlOrCmd: true, shift: true },
 // Edit
  { command: 'editor.action.undo', key: 'z', ctrlOrCmd: true },
  { command: 'editor.action.redo', key: 'y', ctrlOrCmd: true },
  { command: 'editor.action.clipboardCutAction', key: 'x', ctrlOrCmd: true },
  { command: 'editor.action.clipboardCopyAction', key: 'c', ctrlOrCmd: true },
  { command: 'editor.action.clipboardPasteAction', key: 'v', ctrlOrCmd: true },
  { command: 'editor.action.selectAll', key: 'a', ctrlOrCmd: true },
  { command: 'editor.action.copyLinesDownAction', key: 'ArrowDown', ctrlOrCmd: true, shift: true, alt: true },
  { command: 'editor.action.copyLinesUpAction', key: 'ArrowUp', ctrlOrCmd: true, shift: true, alt: true },
  { command: 'editor.action.moveLinesDownAction', key: 'ArrowDown', alt: true },
  { command: 'editor.action.moveLinesUpAction', key: 'ArrowUp', alt: true },
 // View
  { command: 'workbench.action.toggleSidebarVisibility', key: 'b', ctrlOrCmd: true },
  { command: 'workbench.view.explorer', key: 'e', ctrlOrCmd: true, shift: true },
  { command: 'workbench.view.search', key: 'f', ctrlOrCmd: true, shift: true },
  { command: 'workbench.view.scm', key: 'g', ctrlOrCmd: true, shift: true },
  { command: 'workbench.view.debug', key: 'd', ctrlOrCmd: true, shift: true },
  { command: 'workbench.action.toggleMinimap', key: 'm', ctrlOrCmd: true, shift: true },
  { command: 'workbench.action.toggleBreadcrumbs', key: 'b', ctrlOrCmd: true, shift: true, alt: true },
  { command: 'workbench.action.toggleStatusbarVisibility', key: 'u', ctrlOrCmd: true, shift: true, alt: true },
  { command: 'workbench.action.toggleStickyScroll', key: 's', ctrlOrCmd: true, shift: true, alt: true },
  // Palette / navigation
  { command: 'workbench.action.quickOpen', key: 'p', ctrlOrCmd: true, shift: false },
  { command: 'workbench.action.showCommands', key: 'p', ctrlOrCmd: true, shift: true },
  { command: 'workbench.action.gotoLine', key: 'g', ctrlOrCmd: true },
  { command: 'workbench.action.navigateBack', key: 'ArrowLeft', alt: true },
  { command: 'workbench.action.navigateForward', key: 'ArrowRight', alt: true },
 // Search
  { command: 'workbench.action.findInFiles', key: 'f', ctrlOrCmd: true, shift: true },
  { command: 'workbench.action.replaceInFiles', key: 'h', ctrlOrCmd: true, shift: true },
  // Terminal
  { command: 'workbench.action.terminal.new', key: '`', ctrlOrCmd: true, shift: true },
  { command: 'workbench.action.terminal.toggleTerminal', key: '`', ctrlOrCmd: true, shift: false, alt: false },
  { command: 'workbench.action.terminal.clear', key: '`', ctrlOrCmd: true, alt: true },
  // Run
  { command: 'workbench.action.run', key: 'F5', ctrlOrCmd: false, shift: false, alt: false },
  { command: 'workbench.action.runCurrentFile', key: 'F5', ctrlOrCmd: true, shift: false },
  { command: 'workbench.action.stopRun', key: 'F5', shift: true, ctrlOrCmd: false, alt: false },
 // Explorer — single-select operations
  { command: 'explorer.rename', key: 'F2' },
  { command: 'explorer.delete', key: 'Delete' },
  { command: 'explorer.delete', key: 'Backspace', shift: true },
  { command: 'explorer.copyPath', key: 'c', ctrlOrCmd: true, shift: true, alt: true },
 // Explorer clipboard (Ctrl+C/X/V are also edit bindings — explorer takes precedence via `when`)
  { command: 'explorer.copy', key: 'c', ctrlOrCmd: true },
  { command: 'explorer.cut', key: 'x', ctrlOrCmd: true },
  { command: 'explorer.paste', key: 'v', ctrlOrCmd: true },
 // Editor actions — find/replace
  { command: 'editor.action.find', key: 'f', ctrlOrCmd: true },
  { command: 'editor.action.find', key: 'd', ctrlOrCmd: true },
  { command: 'editor.action.replace', key: 'h', ctrlOrCmd: true },
  { command: 'editor.action.startFindReplaceAction', key: 'h', ctrlOrCmd: true },
  { command: 'editor.action.revealDefinition', key: 'F12' },
  { command: 'editor.action.referenceSearch.trigger', key: 'F12', shift: true },
 // Chord: Ctrl+K
  { command: 'workbench.action.closeAllEditors', key: 'w', ctrlOrCmd: true, chord: 'Ctrl+K' },
  { command: 'workbench.action.files.openFolder', key: 'o', ctrlOrCmd: true, chord: 'Ctrl+K' },
 // Settings
  { command: 'workbench.action.openSettings', key: ',', ctrlOrCmd: true },
 // Additional view / panel toggles
  { command: 'workbench.action.toggleSidebar', key: 'b', ctrlOrCmd: true },
  { command: 'workbench.action.explorer.newFile', key: 'n', ctrlOrCmd: true, alt: true },
  { command: 'workbench.action.explorer.newFolder', key: 'n', ctrlOrCmd: true, shift: true, alt: true },
];

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.userAgent.toLowerCase().includes('mac');
}

/** True if Ctrl (Win/Linux) or Cmd (Mac) is pressed */
export function isCtrlOrCmd(e: KeyboardEvent): boolean {
  return isMac() ? e.metaKey : e.ctrlKey;
}

/** Match an event against a single keybinding */
export function matchesKeybinding(e: KeyboardEvent, kb: Keybinding): boolean {
  const ctrlOrCmd = isCtrlOrCmd(e);
  if (kb.ctrlOrCmd !== undefined && kb.ctrlOrCmd !== ctrlOrCmd) return false;
  if (kb.ctrlOrCmdRequired === true && !ctrlOrCmd) return false;
  if (kb.ctrlOrCmdRequired === false && ctrlOrCmd) return false;
  if (kb.shift !== undefined && kb.shift !== e.shiftKey) return false;
  if (kb.alt !== undefined && kb.alt !== e.altKey) return false;
  const key = kb.key.toLowerCase();
  const eKey = e.key.toLowerCase();
  // Special-case: F-keys, ArrowKeys use e.key verbatim
  if (key.startsWith('f') || key.startsWith('arrow')) {
    if (e.key !== kb.key && eKey !== key) return false;
  } else {
    if (eKey !== key) return false;
  }
  if (kb.when && !kb.when()) return false;
  return true;
}

/** Resolve a keyboard event to a command id. */
export function resolveKeybinding(
  e: KeyboardEvent,
  chordPrefix: string | null = null
): string | null {
  for (const kb of DEFAULT_KEYBINDINGS) {
    if (chordPrefix) {
      if (kb.chord !== chordPrefix) continue;
    } else {
      if (kb.chord) continue;
    }
    if (matchesKeybinding(e, kb)) return kb.command;
  }
  return null;
}

/** Helper: try to execute a matched command; returns true if handled */
export async function executeKeybinding(
  e: KeyboardEvent,
  chordPrefix: string | null = null
): Promise<boolean> {
  const id = resolveKeybinding(e, chordPrefix);
  if (!id) return false;
  const cmd = commandRegistry.get(id);
  if (!cmd) return false;
  if (cmd.when && !cmd.when()) return false;
  e.preventDefault();
  await commandRegistry.execute(id);
  return true;
}