/**
 * CM6 Theme
 *
 * CodeMirror theme builder that uses shell tokens so gutter and content share one surface.
 */

import { EditorView } from '@codemirror/view';

export const ntEditorOverride = EditorView.theme({
  '&': {
    backgroundColor: 'var(--nt-editor-bg) !important',
    color: 'var(--nt-editor-fg) !important',
  },
  '.cm-content': {
    caretColor: 'var(--nt-editor-cursor)',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--nt-editor-cursor)',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--nt-editor-selection) !important',
  },
  '.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--nt-editor-selection) !important',
  },
  '.cm-line': {
    caretColor: 'var(--nt-editor-cursor)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--nt-editor-bg) !important',
    color: 'var(--nt-editor-gutter-fg) !important',
    borderRight: '1px solid var(--nt-editor-border) !important',
    borderLeft: 'none !important',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--nt-editor-line-highlight) !important',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--nt-editor-line-highlight) !important',
  },
  '.cm-stickyscroll-container': {
    '--cm-stickyscroll-bg': 'var(--nt-editor-bg)',
    '--cm-stickyscroll-hoverBg': 'var(--nt-hover-bg)',
    '--cm-stickyscroll-currentBg': 'var(--nt-editor-line-highlight)',
    '--cm-stickyscroll-lineNumber': 'var(--nt-editor-gutter-fg)',
    '--cm-stickyscroll-accent': 'var(--nt-prim-accent)',
    '--cm-stickyscroll-border': 'var(--nt-editor-border)',
    '--cm-stickyscroll-gutterBorder': 'var(--nt-editor-border)',
    backgroundColor: 'var(--nt-editor-bg) !important',
    color: 'var(--nt-editor-fg)',
  },
  '.cm-stickyscroll-inner, .cm-stickyscroll-line': {
    backgroundColor: 'inherit !important',
  },
  '.cm-panels': {
    backgroundColor: 'var(--nt-editor-bg)',
    color: 'var(--nt-editor-fg)',
  },
  '.cm-panels-top': {
    borderBottom: '1px solid var(--nt-editor-border)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--nt-overlay-bg) !important',
    border: '1px solid var(--nt-overlay-border) !important',
    color: 'var(--nt-overlay-fg) !important',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--nt-selected-bg) !important',
    color: 'var(--nt-overlay-fg) !important',
  },
  '.cm-matchingBracket': {
    outline: '1px solid var(--nt-focus-border)',
  },
  '.cm-nonmatchingBracket': {
    outline: '1px solid var(--nt-status-error)',
  },
});
