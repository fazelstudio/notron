/**
 * Editor Action Commands
 *
 * Registers editor editing commands that dispatch via eventBus.
 * All editor onClick/menu triggers go through commandRegistry.
 */

import { commandRegistry } from './registry';
import { eventBus } from '../utils/eventBus';

function reg(id: string, label: string, category: string, action: (...args:any[])=>any) { if (!commandRegistry.has(id)) commandRegistry.register({ id, label, category, action }); }
reg('editor.action.undo', 'Undo', 'Edit', () => eventBus.emit('editor:action', { action: 'undo' }));
reg('editor.action.redo', 'Redo', 'Edit', () => eventBus.emit('editor:action', { action: 'redo' }));
reg('editor.action.clipboardCutAction', 'Cut', 'Edit', () => { try { document.execCommand('cut'); } catch {} });
reg('editor.action.clipboardCopyAction', 'Copy', 'Edit', () => { try { document.execCommand('copy'); } catch {} });
reg('editor.action.clipboardPasteAction', 'Paste', 'Edit', () => { try { document.execCommand('paste'); } catch {} });
reg('editor.action.selectAll', 'Select All', 'Selection', () => eventBus.emit('editor:action', { action: 'selectAll' }));
reg('editor.action.copyLinesDownAction', 'Copy Line Down', 'Selection', () => eventBus.emit('editor:action', { action: 'copyLineDown' }));
reg('editor.action.copyLinesUpAction', 'Copy Line Up', 'Selection', () => eventBus.emit('editor:action', { action: 'copyLineUp' }));
reg('editor.action.moveLinesDownAction', 'Move Line Down', 'Selection', () => eventBus.emit('editor:action', { action: 'moveLineDown' }));
reg('editor.action.moveLinesUpAction', 'Move Line Up', 'Selection', () => eventBus.emit('editor:action', { action: 'moveLineUp' }));
reg('editor.action.find', 'Find', 'Edit', () => eventBus.emit('editor:action', { action: 'find' }));
reg('editor.action.replace', 'Replace', 'Edit', () => eventBus.emit('editor:action', { action: 'replace' }));
reg('actions.find', 'Find', 'Edit', () => eventBus.emit('editor:action', { action: 'find' }));
reg('editor.action.startFindReplaceAction', 'Replace', 'Edit', () => eventBus.emit('editor:action', { action: 'replace' }));
reg('editor.action.revealDefinition', 'Go to Definition', 'Go', () => {
  void window.dispatchEvent(new CustomEvent('editor:find-references-trigger', { detail: { kind: 'definition' } }));
  void window.dispatchEvent(new CustomEvent('notron:goto-definition'));
});
reg('editor.action.referenceSearch.trigger', 'Find All References', 'Go', () => {
  void window.dispatchEvent(new CustomEvent('editor:find-references'));
});
