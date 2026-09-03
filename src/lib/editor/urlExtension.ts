/**
 * CodeMirror 6 extension that detects URLs in the document,
 * underlines them on hover, and shows a confirmation dialog
 * before opening in the system browser (Ctrl+Click).
 */

import { EditorView, ViewPlugin, Decoration, DecorationSet } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

const URL_REGEX = /\bhttps?:\/\/[^\s<>)\]"'`]+/g;

const urlDecoration = Decoration.mark({
  attributes: {
    style: 'text-decoration: underline; text-decoration-style: dotted; cursor: pointer;',
  },
  class: 'cm-url-link',
});

function scanUrls(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let match: RegExpExecArray | null;
    URL_REGEX.lastIndex = 0;
    while ((match = URL_REGEX.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      builder.add(start, end, urlDecoration);
    }
  }
  return builder.finish();
}

function handleClick(event: MouseEvent, view: EditorView): boolean {
  if (!event.ctrlKey && !event.metaKey) return false;

  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos === null) return false;

  const line = view.state.doc.lineAt(pos);
  const text = line.text;
  const offset = pos - line.from;

  URL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_REGEX.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    if (offset >= matchStart && offset <= matchEnd) {
      const url = match[0];
      event.preventDefault();
      showOpenUrlDialog(url);
      return true;
    }
  }
  return false;
}

function openUrlExternally(url: string) {
  import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
    openUrl(url).catch((err) => {
      console.warn('openUrl failed, trying shell open:', err);
      import('@tauri-apps/plugin-shell').then(({ open }) => {
        open(url).catch(() => {});
      }).catch(() => {});
    });
  }).catch(() => {
    import('@tauri-apps/plugin-shell').then(({ open }) => {
      open(url).catch(() => {});
    }).catch(() => {});
  });
}

function showOpenUrlDialog(url: string) {
  const existing = document.querySelector('[data-notron-url-dialog]');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.setAttribute('data-notron-url-dialog', 'true');
  backdrop.className = 'fixed inset-0 z-[250] flex items-center justify-center bg-canvas/50 backdrop-blur-sm';

  const dialog = document.createElement('div');
  dialog.className = 'bg-surface-2 border border-subtle rounded-lg shadow-elevated p-5 max-w-md w-full mx-4';

  dialog.innerHTML = `
    <p class="text-sm text-primary mb-1">Do you want to open this link in your browser?</p>
    <p class="text-xs text-accent break-all mb-5 select-text cursor-text">${url}</p>
    <div class="flex justify-end gap-3">
      <button data-action="cancel" class="px-4 py-2 text-sm rounded bg-surface-2 hover:bg-hover transition-colors text-primary border border-subtle cursor-pointer">
        Cancel
      </button>
      <button data-action="open" class="px-4 py-2 text-sm rounded bg-accent hover:bg-accent-hover transition-colors text-on-accent border border-transparent cursor-pointer">
        Open URL
      </button>
    </div>
  `;

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  function cleanup() {
    backdrop.remove();
  }

  dialog.querySelector('[data-action="cancel"]')?.addEventListener('click', cleanup);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) cleanup();
  });

  dialog.querySelector('[data-action="open"]')?.addEventListener('click', () => {
    cleanup();
    openUrlExternally(url);
  });

  (dialog.querySelector('[data-action="open"]') as HTMLElement)?.focus();

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanup();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}

export function urlLinkExtension() {
  return [
    EditorView.domEventHandlers({
      click: handleClick,
    }),
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = scanUrls(view);
        }
        update(update: ViewUpdate) {
          if (update.docChanged || update.viewportChanged) {
            this.decorations = scanUrls(update.view);
          }
        }
      },
      {
        decorations: (v) => v.decorations,
      }
    ),
  ];
}
