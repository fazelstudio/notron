import { settingsStore } from '../../stores/settings.svelte';
import { materialFileIconSvg, materialFolderIconSvg } from './iconRenderer.svelte';

/**
 * `renderPathIcon` provider for the breadcrumb plugin, reusing the editor's
 * default icon theme (the same lucide glyphs the FileTree renders via
 * `getFileIcon`). The plugin expects raw HTML, so the
 * lucide `iconNode` data is serialized into inline SVG strings here instead of
 * mounting Svelte components.
 */

type IconNode = readonly (readonly [tag: string, attrs: Record<string, string>])[];

function svgAttrs(size: number): string {
  return (
    `xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round"`
  );
}

function lucideSvg(node: IconNode, size = 14): string {
  const inner = node
    .map(([tag, attrs]) => {
      const attrStr = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      return `<${tag} ${attrStr}/>`;
    })
    .join('');
  return `<svg ${svgAttrs(size)} class="cm-breadcrumbs-icon" aria-hidden="true">${inner}</svg>`;
}

const FILE: IconNode = [
  ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
  ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
];
const FILE_CODE: IconNode = [
  ['path', { d: 'M10 12.5 8 15l2 2.5' }],
  ['path', { d: 'm14 12.5 2 2.5-2 2.5' }],
  ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
  ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z' }],
];
const FILE_JSON: IconNode = [
  ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
  ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
  ['path', { d: 'M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1' }],
  ['path', { d: 'M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1' }],
];
const FILE_TEXT: IconNode = [
  ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
  ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
  ['path', { d: 'M10 9H8' }],
  ['path', { d: 'M16 13H8' }],
  ['path', { d: 'M16 17H8' }],
];
const IMAGE: IconNode = [
  ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2' }],
  ['circle', { cx: '9', cy: '9', r: '2' }],
  ['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }],
];
const SETTINGS: IconNode = [
  ['path', { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' }],
  ['circle', { cx: '12', cy: '12', r: '3' }],
];
const GLOBE: IconNode = [
  ['circle', { cx: '12', cy: '12', r: '10' }],
  ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }],
  ['path', { d: 'M2 12h20' }],
];
const HASH: IconNode = [
  ['line', { x1: '4', x2: '20', y1: '9', y2: '9' }],
  ['line', { x1: '4', x2: '20', y1: '15', y2: '15' }],
  ['line', { x1: '10', x2: '8', y1: '3', y2: '21' }],
  ['line', { x1: '16', x2: '14', y1: '3', y2: '21' }],
];

/** Mirrors `TreeNode.getFileIcon`'s ICON_MAP. */
const FILE_ICONS: Record<string, IconNode> = {
  ts: FILE_CODE, tsx: FILE_CODE, js: FILE_CODE, jsx: FILE_CODE,
  rs: FILE_CODE, py: FILE_CODE, go: FILE_CODE,
  html: GLOBE, css: HASH, json: FILE_JSON,
  md: FILE_TEXT, svg: IMAGE, png: IMAGE, jpg: IMAGE, jpeg: IMAGE, webp: IMAGE, gif: IMAGE,
  toml: SETTINGS, yaml: SETTINGS, yml: SETTINGS,
};

/**
 * Renders the file/folder icon for a breadcrumb explorer dropdown row using the
 * same lucide glyphs as the FileTree. Returns `null` to let the plugin fall
 * back to its built-in icons (never happens here — every entry gets an icon).
 */
export { FILE_ICONS, lucideSvg, FILE };

export function renderBreadcrumbPathIcon(
  entry: { name: string; isDir: boolean },
  _expanded: boolean,
): string | null {
  const iconTheme = settingsStore.effectiveSettings.icon_theme;
  
  if (iconTheme === 'off') return `<span style="display:none"></span>`;

  if (iconTheme === 'material') {
    // Inline SVG renders synchronously (bundled assets, no loading phase).
    const svg = entry.isDir
      ? materialFolderIconSvg(entry.name, 14)
      : materialFileIconSvg(entry.name, 14);
    const wrapper = 'width:14px;height:14px;display:inline-block;vertical-align:-2px;';
    return `<span class="cm-breadcrumbs-icon" style="${wrapper}">${svg}</span>`;
  }

  if (entry.isDir) return null;

  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  return lucideSvg(FILE_ICONS[ext] ?? FILE);
}
