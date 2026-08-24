/**
 * searchResultHighlight.ts — temporary highlight + label for a search result
 * opened from the Search panel.
 *
 * Clicking a result opens the file (if needed) and jumps to the line; this
 * extension marks the exact matched span and renders a small label bar above
 * the line so the result stays visible in the viewport for quick navigation.
 * The highlight is replaced by the next navigation and auto-clears after
 * SEARCH_RESULT_HIGHLIGHT_MS so it never lingers on the document.
 */

import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField, type Extension } from '@codemirror/state';

export interface SearchResultRange {
  from: number;
  to: number;
}

export const setSearchResultHighlight = StateEffect.define<SearchResultRange>();
export const clearSearchResultHighlight = StateEffect.define<null>();

const highlightMark = Decoration.mark({ class: 'cm-search-result' });

class SearchResultLabelWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly lineNo: number,
  ) {
    super();
  }

  eq(other: SearchResultLabelWidget) {
    return this.label === other.label && this.lineNo === other.lineNo;
  }

  toDOM() {
    const dom = document.createElement('div');
    dom.className = 'cm-search-result-label';
    const icon = document.createElement('span');
    icon.className = 'cm-search-result-label-icon';
    icon.textContent = '▸';
    const text = document.createElement('span');
    text.className = 'cm-search-result-label-text';
    text.textContent = this.label;
    text.title = this.label;
    dom.appendChild(icon);
    dom.appendChild(text);
    return dom;
  }
}

export const searchResultHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    let next = decorations.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setSearchResultHighlight)) {
        const label = tr.state.sliceDoc(e.value.from, e.value.to);
        const line = tr.state.doc.lineAt(Math.max(e.value.from, e.value.to - 1));
        const short = label.trim().length > 40 ? label.trim().slice(0, 40) + '…' : label.trim() || '·';
        const widgets =
          e.value.to > e.value.from
            ? [highlightMark.range(e.value.from, e.value.to)]
            : [];
        widgets.push(
          Decoration.widget({
            widget: new SearchResultLabelWidget(short, line.number),
            block: true,
            side: -1,
          }).range(line.from),
        );
        next = Decoration.set(widgets, true);
      } else if (e.is(clearSearchResultHighlight)) {
        next = Decoration.none;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function searchResultHighlightExtensions(): Extension[] {
  return [
    searchResultHighlightField,
    EditorView.theme({
      '.cm-search-result': {
        background: 'color-mix(in srgb, var(--accent) 25%, transparent)',
        outline: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
        borderRadius: '2px',
      },
      '.cm-search-result-label': {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        minHeight: '20px',
        marginBottom: '1px',
        padding: '1px 8px',
        fontSize: '11px',
        lineHeight: '1.4',
        color: 'var(--accent)',
        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
        borderBottom: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
        userSelect: 'none',
        pointerEvents: 'none',
      },
      '.cm-search-result-label-icon': {
        flexShrink: 0,
        opacity: 0.8,
      },
      '.cm-search-result-label-text': {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
    }),
  ];
}