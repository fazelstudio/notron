/**
 * Keybinding Service
 *
 * Resolves keyboard events to commands via the registry.
 * Keeps chord state and falls back to minimal browser handling
 * when no command matches. All app features go through the
 * command registry — no direct store calls here.
 */

import { uiStore } from '../stores/ui';
import { commandRegistry } from '../commands/registry';
import { resolveKeybinding } from '../commands/keybindings';

export interface KeybindingContext {
  openCommandPalette: (initialQuery?: string) => void;
  openSettings: () => void;
  openGlobalSearch: () => void;
  handleTabClose: (tabId: string) => void;
  handleNewTextFile: () => void;
  getIsGoToLineOpen: () => boolean;
  setIsGoToLineOpen: (open: boolean) => void;
  getBaseCommands: () => Array<{ action: () => void }>;
}

/**
 * Create global keydown/mouse handlers. The returned attach() manages
 * listeners. Chord prefix and timeout are encapsulated.
 */
export function createGlobalKeybindingHandlers(ctx: KeybindingContext) {
  let chordPrefix: string | null = null;
  let chordTimeout: number | null = null;

  function clearChord() {
    chordPrefix = null;
    if (chordTimeout) clearTimeout(chordTimeout);
    chordTimeout = null;
    uiStore.setGlobalStatus(null);
  }

  function handleGlobalMouseUp(e: MouseEvent) {
    if (e.button === 3) {
      e.preventDefault();
      void commandRegistry.execute('workbench.action.navigateBack');
    } else if (e.button === 4) {
      e.preventDefault();
      void commandRegistry.execute('workbench.action.navigateForward');
    }
  }

  async function handleGlobalKeydown(e: KeyboardEvent) {
    const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac');
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
    const key = e.key.toLowerCase();

    // Chord second key: resolve via registry with chord prefix.
    if (chordPrefix) {
      e.preventDefault();
      e.stopPropagation();
      const chordCommand = resolveKeybinding(e, chordPrefix);
      if (chordCommand) {
        await commandRegistry.execute(chordCommand);
      }
      clearChord();
      return;
    }

    // Chord trigger: Ctrl+K.
    if (cmdOrCtrl && key === 'k' && !e.shiftKey) {
      e.preventDefault();
      chordPrefix = 'Ctrl+K';
      uiStore.setGlobalStatus('Ctrl+K was pressed. Waiting for second key of chord...');
      chordTimeout = setTimeout(() => {
        clearChord();
      }, 3000) as unknown as number;
      return;
    }

    // Registry-driven dispatch (primary path)
    // Try to resolve a declarative keybinding and execute the command.
    const commandId = resolveKeybinding(e, null);
    if (commandId && commandRegistry.has(commandId)) {
      const cmd = commandRegistry.get(commandId);
      if (!cmd?.when || cmd.when()) {
        e.preventDefault();
        await commandRegistry.execute(commandId);
        return;
      }
    }

    // Fallback / browser-default prevention — minimal, non-feature logic.
    // Prevent browser zoom (Ctrl + +/-/0) and refresh (Ctrl+R / F5) that.
    // Are not app features but would affect the webview.
    if (cmdOrCtrl && (key === '+' || key === '=' || key === '-' || key === '0')) {
      e.preventDefault();
      return;
    }
    if (e.key === 'F5' || (cmdOrCtrl && key === 'r')) {
      // Let F5 run commands handle it via registry (workbench.action.run etc.),
      // But prevent browser reload when no command matched.
      e.preventDefault();
      return;
    }
    // Prevent browser Find (Ctrl+F) when no command handled it — editor handles its own.
    if (cmdOrCtrl && key === 'f' && !e.shiftKey) {
      // If registry didn't handle it, still prevent browser dialog.
      // Registry has editor.action.find for this case, so this is rarely reached.
      e.preventDefault();
      return;
    }
  }

  function attach() {
    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    const preventCM = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('contextmenu', preventCM);
    const openCmd = () => ctx.openCommandPalette('>');
    window.addEventListener('open-command-palette', openCmd);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeydown);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('contextmenu', preventCM);
      window.removeEventListener('open-command-palette', openCmd);
    };
  }

  return { handleGlobalKeydown, handleGlobalMouseUp, attach, clearChord };
}
