/**
 * Breadcrumbs
 *
 * Theme and icon sync for the breadcrumb bar.
 */
import { registerLanguageMapping } from '@fazelstudio/codemirror-breadcrumbs';


import { EditorView } from '@codemirror/view';
import { settingsStore } from '../stores/settings.svelte';
import { getIconProvider } from '../icon-theme/registry';

// Fallback lucide icons (copied from breadcrumbPathIcons to avoid direct extension import).
type IconNode = readonly (readonly [tag: string, attrs: Record<string, string>])[];
function svgAttrs(size: number): string {
  return `xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
}
function lucideSvg(node: IconNode, size = 14): string {
  const inner = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')} />`).join('');
  return `<svg ${svgAttrs(size)} class="cm-breadcrumbs-icon" aria-hidden="true">${inner}</svg>`;
}
const FILE: IconNode = [['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }], ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }]];
const FILE_CODE: IconNode = [['path', { d: 'M10 12.5 8 15l2 2.5' }], ['path', { d: 'm14 12.5 2 2.5-2 2.5' }], ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }], ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z' }]];
const FILE_JSON: IconNode = [['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }], ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }], ['path', { d: 'M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1' }], ['path', { d: 'M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1' }]];
const FILE_TEXT: IconNode = [['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }], ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }], ['path', { d: 'M10 9H8' }], ['path', { d: 'M16 13H8' }], ['path', { d: 'M16 17H8' }]];
const IMAGE: IconNode = [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2' }], ['circle', { cx: '9', cy: '9', r: '2' }], ['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }]];
const SETTINGS: IconNode = [['path', { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' }], ['circle', { cx: '12', cy: '12', r: '3' }]];
const GLOBE: IconNode = [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }], ['path', { d: 'M2 12h20' }]];
const HASH: IconNode = [['line', { x1: '4', x2: '20', y1: '9', y2: '9' }], ['line', { x1: '4', x2: '20', y1: '15', y2: '15' }], ['line', { x1: '10', x2: '8', y1: '3', y2: '21' }], ['line', { x1: '16', x2: '14', y1: '3', y2: '21' }]];
const FILE_ICONS: Record<string, IconNode> = { ts: FILE_CODE, tsx: FILE_CODE, js: FILE_CODE, jsx: FILE_CODE, rs: FILE_CODE, py: FILE_CODE, go: FILE_CODE, html: GLOBE, css: HASH, json: FILE_JSON, md: FILE_TEXT, svg: IMAGE, png: IMAGE, jpg: IMAGE, jpeg: IMAGE, webp: IMAGE, gif: IMAGE, toml: SETTINGS, yaml: SETTINGS, yml: SETTINGS };

/**
 * Puts the configured icon theme onto the breadcrumb top-bar segments.
 *
 * The plugin renders its own built-in (generic) icon on every segment, which
 * used to flash in until this function replaced it — and because the plugin
 * rebuilds the bar on EVERY doc/selection change, the old implementation
 * (re-creating an <img> per rebuild, wrapped in requestAnimationFrame) made
 * the breadcrumb icons flicker on each keystroke.
 *
 * Now this runs synchronously right after a rebuild (MutationObserver — a
 * microtask, so the intermediate built-in icon is never painted), strips the
 * plugin icon and inserts the themed icon as inline SVG (synchronous — no
 * async image load). While a material icon is fetched for the first time an
 * empty slot is shown; `materialIconState` re-triggers this once it loads.
 */
export function syncBreadcrumbBarIcons(view: EditorView) {
  const bar = view.dom.querySelector('.cm-breadcrumbs');
  if (!bar) return;

  const iconTheme = settingsStore.effectiveSettings.icon_theme;
  const segments = bar.querySelectorAll('.cm-breadcrumbs-segment');
  segments.forEach((seg) => {
    if (seg.classList.contains('cm-breadcrumbs-kind-folder')) return;

    const labelEl = seg.querySelector('.cm-breadcrumbs-segment-label');
    const label = labelEl?.textContent || '';

    // Strip the plugin's built-in icon whenever it is present (the plugin
    // re-adds it on every rebuild; removing it mutates the DOM, so this only
    // happens when it actually exists — keeps the observer loop terminating).
    seg.querySelectorAll(':scope > svg').forEach((el) => el.remove());

    const existing = seg.querySelector<HTMLElement>('[data-notron-icon]');

    if (iconTheme === 'off') {
      existing?.remove();
      return;
    }

    const provider: any = getIconProvider(iconTheme);
    const hasSvg = typeof provider?.getFileIconSvg === 'function';
    if (hasSvg) {
      const svg: string | undefined = provider?.getFileIconSvg?.(label, 14) as string | undefined;
      const iconName: string = (provider?.getFileIcon?.(label) as string | undefined) ?? label;
      if (existing?.getAttribute('data-notron-icon') === `svg:${iconName}`) return;
      existing?.remove();
      const iconEl = document.createElement('span');
      iconEl.className = 'cm-breadcrumbs-icon';
      iconEl.setAttribute('data-notron-icon', `svg:${iconName}`);
      iconEl.innerHTML = svg ?? '';
      seg.insertBefore(iconEl, labelEl || null);
    } else {
      const ext = label.split('.').pop()?.toLowerCase();
      if (existing?.getAttribute('data-notron-icon') === `default:${ext || ''}`) return;
      existing?.remove();
      const iconNode = FILE_ICONS[ext || ''] || FILE;
      const iconEl = document.createElement('span');
      iconEl.className = 'cm-breadcrumbs-icon';
      iconEl.setAttribute('data-notron-icon', `default:${ext || ''}`);
      iconEl.innerHTML = lucideSvg(iconNode, 14);
      seg.insertBefore(iconEl, labelEl || null);
    }
  });
}

let breadcrumbObserver: MutationObserver | null = null;
let breadcrumbObserverTarget: HTMLElement | null = null;

/**
 * Watches the breadcrumb bar so icon re-sync happens immediately after any
 * plugin rebuild (mount, doc change, resize, dropdown) — before the browser
 * paints, so the plugin's built-in icons never flash in.
 */
export function ensureBreadcrumbObserver(view: EditorView) {
  const bar = view.dom.querySelector<HTMLElement>('.cm-breadcrumbs');
  if (!bar) return;
  if (breadcrumbObserver && breadcrumbObserverTarget === bar) return;
  breadcrumbObserver?.disconnect();
  breadcrumbObserverTarget = bar;
  breadcrumbObserver = new MutationObserver(() => syncBreadcrumbBarIcons(view));
  breadcrumbObserver.observe(bar, { childList: true, subtree: true });
}

/** Tears down the observer when the editor is destroyed. */
export function disposeBreadcrumbObserver(): void {
  breadcrumbObserver?.disconnect();
  breadcrumbObserver = null;
  breadcrumbObserverTarget = null;
}

export const notronBreadcrumbsTheme = EditorView.theme({
  '.cm-breadcrumbs': {
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
    width: '100%',
    height: '28px',
    fontSize: '11px',
    lineHeight: '1',
    background: 'transparent',
    color: 'var(--text-secondary)',
    borderTop: '1px solid var(--nt-editor-border)',
    borderBottom: '1px solid var(--nt-editor-border)'
  },
  '.cm-breadcrumbs-file': {
    padding: '2px 4px',
    color: 'var(--text-secondary)'
  },
  '.cm-breadcrumbs-segment': {
    padding: '2px 4px',
    color: 'var(--text-secondary)'
  },
  '.cm-breadcrumbs-segment:hover': {
    background: 'var(--bg-hover) !important',
    color: 'var(--text-primary) !important'
  },
  '.cm-breadcrumbs-segment:focus-visible': {
    outline: '1px solid var(--border-focus)',
    outlineOffset: '-1px'
  },
  '.cm-breadcrumbs-separator': {
    color: 'var(--text-muted)'
  },
  '.cm-breadcrumbs-language-sep': {
    color: 'var(--accent)'
  },
  '.cm-breadcrumbs-ellipsis': {
    color: 'var(--text-secondary)'
  },
  '.cm-breadcrumbs-ellipsis:hover': {
    background: 'var(--bg-hover)'
  },
  '.cm-breadcrumbs-dropdown': {
    background: 'var(--bg-surface-2) !important',
    border: '1px solid var(--border-subtle) !important',
    boxShadow: 'var(--shadow-elevated) !important'
  },
  '.cm-breadcrumbs-dropdown-title': {
    color: 'var(--text-muted)'
  },
  '.cm-breadcrumbs-dropdown-item': {
    color: 'var(--text-primary)'
  },
  '.cm-breadcrumbs-dropdown-item:hover': {
    background: 'var(--bg-hover) !important',
    color: 'var(--text-primary) !important'
  },
  '.cm-breadcrumbs-dropdown-item.is-active': {
    background: 'var(--bg-selected) !important',
    color: 'var(--text-on-accent) !important'
  },
  '.cm-breadcrumbs-dropdown-empty': {
    color: 'var(--text-muted)'
  },
  '.cm-breadcrumbs-path-header': {
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border-subtle)'
  },
  '.cm-breadcrumbs-path-item': {
    color: 'var(--text-primary)'
  },
  '.cm-breadcrumbs-path-item:hover': {
    background: 'var(--bg-hover) !important',
    color: 'var(--text-primary) !important'
  },
  '.cm-breadcrumbs-path-item.is-active': {
    background: 'var(--bg-selected) !important',
    color: 'var(--text-on-accent) !important'
  },
  '.cm-breadcrumbs-path-up': {
    color: 'var(--text-muted)'
  },
  '.cm-breadcrumbs-path-up:hover': {
    background: 'var(--bg-hover) !important',
    color: 'var(--text-primary) !important'
  },
  '.cm-breadcrumbs-path-empty': {
    color: 'var(--text-muted)'
  },
  '.cm-breadcrumbs-kind-folder': { color: 'var(--accent)' },
  '.cm-breadcrumbs-kind-file': { color: 'var(--text-muted)' },
  '.cm-breadcrumbs-kind-namespace': { color: 'var(--text-secondary)' },
  '.cm-breadcrumbs-kind-class': { color: 'var(--color-warning)' },
  '.cm-breadcrumbs-kind-interface': { color: 'var(--accent)' },
  '.cm-breadcrumbs-kind-function': { color: 'var(--accent-active)' },
  '.cm-breadcrumbs-kind-method': { color: 'var(--accent-active)' },
  '.cm-breadcrumbs-kind-variable': { color: 'var(--color-info)' },
  '.cm-breadcrumbs-kind-constant': { color: 'var(--color-info)' },
  '.cm-breadcrumbs-kind-enum': { color: 'var(--accent-active)' },
  '.cm-breadcrumbs-kind-property': { color: 'var(--text-secondary)' },
  '.cm-breadcrumbs-kind-heading': { color: 'var(--text-primary)' },
  '.cm-breadcrumbs-kind-block': { color: 'var(--text-muted)' },
  '.cm-breadcrumbs-kind-tag': { color: 'var(--accent)' },
  '.cm-breadcrumbs-kind-other': { color: 'var(--text-muted)' }
});

// Community Language Mappings
registerLanguageMapping({
  languageName: 'clojure',
  nodeHandlers: {
    'List': {
      kind: 'function',
      extractLabel: (node: any, state: any) => {
        let first = node.firstChild;
        while (first && (first.name === '(' || first.name === 'Metadata')) {
          first = first.nextSibling;
        }
        if (first && first.name === 'DefLike') {
          let varName = first.nextSibling;
          while (varName && varName.name !== 'VarName' && varName.name !== 'Symbol') {
            varName = varName.nextSibling;
          }
          if (varName) {
            return state.sliceDoc(varName.from, varName.to);
          }
        }
        return null;
      }
    }
  }
});
