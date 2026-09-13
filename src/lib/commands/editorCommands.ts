/**
 * Editor Commands
 *
 * Registers editor actions.
 */

import { commandRegistry } from './registry';

export function registerEditorCommands(ctx: {
  undo: () => void;
  redo: () => void;
  selectAll: () => void;
  copyLineUp: () => void;
  copyLineDown: () => void;
  moveLineUp: () => void;
  moveLineDown: () => void;
  find: () => void;
  replace: () => void;
  gotoDefinition: () => void;
  findReferences: () => void;
  runCode: () => void;
  gotoLine?: () => void;
}): void {
  const defs = [
    { id: 'editor.action.undo', label: 'Undo', shortcut: 'Ctrl+Z', action: ctx.undo },
    { id: 'editor.action.redo', label: 'Redo', shortcut: 'Ctrl+Y', action: ctx.redo },
    { id: 'editor.action.selectAll', label: 'Select All', shortcut: 'Ctrl+A', action: ctx.selectAll },
    { id: 'editor.action.copyLinesUpAction', label: 'Copy Line Up', shortcut: 'Shift+Alt+Up', action: ctx.copyLineUp },
    { id: 'editor.action.copyLinesDownAction', label: 'Copy Line Down', shortcut: 'Shift+Alt+Down', action: ctx.copyLineDown },
    { id: 'editor.action.moveLinesUpAction', label: 'Move Line Up', shortcut: 'Alt+Up', action: ctx.moveLineUp },
    { id: 'editor.action.moveLinesDownAction', label: 'Move Line Down', shortcut: 'Alt+Down', action: ctx.moveLineDown },
    { id: 'editor.action.find', label: 'Find', shortcut: 'Ctrl+F', action: ctx.find },
    { id: 'editor.action.replace', label: 'Replace', shortcut: 'Ctrl+H', action: ctx.replace },
    { id: 'editor.action.revealDefinition', label: 'Go to Definition', shortcut: 'F12', action: ctx.gotoDefinition },
    { id: 'editor.action.referenceSearch.trigger', label: 'Find All References', shortcut: 'Shift+F12', action: ctx.findReferences },
    { id: 'workbench.action.debug.run', label: 'Run Code', shortcut: 'Ctrl+F5', action: ctx.runCode },
    ...(ctx.gotoLine ? [{ id: 'workbench.action.gotoLine', label: 'Go to Line', shortcut: 'Ctrl+G', action: ctx.gotoLine }] : [])
  ];
  for (const c of defs) if (!commandRegistry.has(c.id)) commandRegistry.register(c as any);
}
