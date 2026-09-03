/**
 * Shared CodeMirror 6 extensions used by every editor instance (full and
 * large-file variants). Extracted from Editor.svelte's <script module>.
 */

import {
  keymap, highlightSpecialChars, dropCursor, rectangularSelection,
  crosshairCursor, highlightActiveLine, EditorView, scrollPastEnd,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
  defaultKeymap, history, historyKeymap, selectAll, copyLineUp,
  copyLineDown, moveLineUp, moveLineDown, deleteLine, indentMore,
  indentLess, selectLine, insertNewline, insertNewlineAndIndent,
  toggleComment, blockComment,
} from '@codemirror/commands';
import { highlightSelectionMatches, selectNextOccurrence } from '@codemirror/search';
import {
  bracketMatching, foldKeymap, indentOnInput, syntaxHighlighting,
  defaultHighlightStyle, foldCode, unfoldCode, toggleFold,
} from '@codemirror/language';
import {
  closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap,
} from '@codemirror/autocomplete';
import { indentationMarkers } from '@replit/codemirror-indentation-markers';
import { urlLinkExtension } from './urlExtension';

export const COMMON_EXTENSIONS: Extension[] = [
  EditorView.theme({
    '&': { backgroundColor: 'transparent !important', height: '100%' },
    '.cm-gutters': { backgroundColor: 'var(--bg-canvas) !important', borderRight: 'none !important', borderLeft: 'none !important' },
    '.cm-lineNumbers .cm-gutterElement': { paddingLeft: '8px !important', paddingRight: '8px !important', minWidth: '32px !important', textAlign: 'right' },
    '.cm-foldGutter .cm-gutterElement': { paddingLeft: '0px !important', paddingRight: '0px !important', width: '20px !important', textAlign: 'center', cursor: 'pointer' },
    '.cm-scroller': { overflow: 'auto !important', overscrollBehaviorX: 'none !important' },
    '.cm-gutters:not(:hover) .custom-fold-marker.is-open': { opacity: 0 },
    '.cm-gutters:hover .custom-fold-marker.is-open': { opacity: 1 },
    '.custom-fold-marker': { transition: 'opacity 0.2s' },
    '.cm-panels': { zIndex: '10 !important' },
    '.cm-panels-top': { zIndex: '50 !important', borderBottom: 'none !important' },
    '.cm-stickyscroll-container': { borderBottom: '1px solid var(--border-subtle) !important' },
    '.cm-breadcrumbs-segment.cm-breadcrumbs-kind-folder > svg': { display: 'none' }
  }),
  indentationMarkers({
    hideFirstIndent: true,
    colors: {
      light: 'var(--border-subtle)',
      dark: 'var(--border-subtle)',
      activeLight: 'var(--text-muted)',
      activeDark: 'var(--text-muted)'
    }
  }),
  highlightSpecialChars(),
  history(),
  // drawSelection is removed so native CSS ::selection is used, covering only text
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  EditorView.domEventHandlers({
    contextmenu(e: MouseEvent, view: EditorView) {
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos !== null) {
        view.dispatch({ selection: { anchor: pos, head: pos } });
      }
    }
  }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  scrollPastEnd(),
  urlLinkExtension(),
  keymap.of([
    ...defaultKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...closeBracketsKeymap,
    // Custom Notron keybindings
    { key: 'Mod-x', run: deleteLine, preventDefault: true },
    { key: 'Shift-Mod-k', run: deleteLine, preventDefault: true },
    { key: 'Mod-Enter', run: insertNewlineAndIndent, preventDefault: true },
    { key: 'Shift-Mod-Enter', run: insertNewline, preventDefault: true },
    { key: 'Alt-Down', run: moveLineDown, preventDefault: true },
    { key: 'Alt-Up', run: moveLineUp, preventDefault: true },
    { key: 'Shift-Alt-Down', run: copyLineDown, preventDefault: true },
    { key: 'Shift-Alt-Up', run: copyLineUp, preventDefault: true },
    { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
    { key: 'Mod-l', run: selectLine, preventDefault: true },
    { key: 'Shift-Mod-l', run: selectAll, preventDefault: true },
    { key: 'Mod-/', run: toggleComment, preventDefault: true },
    { key: 'Shift-Mod-a', run: blockComment, preventDefault: true },
    { key: 'Mod-]', run: indentMore, preventDefault: true },
    { key: 'Mod-[', run: indentLess, preventDefault: true },
    { key: 'Shift-Mod-\\', run: toggleFold, preventDefault: true },
    { key: 'Shift-Mod-]', run: unfoldCode, preventDefault: true },
    { key: 'Shift-Mod-[', run: foldCode, preventDefault: true },
  ]),
];

/**
 * Extension set used when a file is too large for the full feature set.
 * Currently identical to COMMON_EXTENSIONS; later the heavy extensions
 * (autocompletion, selection highlighting, ...) should be dropped here.
 */
export const COMMON_EXTENSIONS_LARGE_FILE = COMMON_EXTENSIONS;