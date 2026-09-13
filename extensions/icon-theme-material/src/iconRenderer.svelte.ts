/**
 * IconRenderer.Svelte
 *
 * Extension module..
 */
import {
  getMaterialIcon,
  getMaterialFolderIcon,
  FOLDER_OPEN_ICONS,
  LIGHT_VARIANT_ICONS,
  ROOT_FOLDER_ICON,
} from './iconMap';
import { MATERIAL_ICON_SVGS } from './iconAssets';
import { themeStore } from '../../../src/lib/stores/theme';

/**
 * Synchronous material icon rendering.
 *
 * Every SVG is embedded in the bundle (see materialIconAssets.ts) and looked
 * up in memory, so markup for any icon — first call included — is available
 * immediately. There is no async loading phase: the window's first paint
 * already contains fully rendered icons, and unknown names degrade to an
 * empty string instead of flashing a different icon.
 *
 * `materialIconState.version` exists purely for theme flips: switching between
 * dark/light swaps some icons to their `_light` variant, and bumping the
 * version makes every `$derived` consumer re-run.
 */

/**
 * Reactive render state. `version` is bumped when the light/dark icon variant
 * flips so Svelte re-renders consumers. Stored as an object property because
 * exported `$state` may only be mutated, never reassigned.
 */
export const materialIconState = $state({ version: 0, isLight: false });

if (typeof window !== 'undefined') {
  themeStore.subscribe(({ isDark }) => {
    const isLight = !isDark;
    if (materialIconState.isLight !== isLight) {
      materialIconState.isLight = isLight;
      materialIconState.version++;
    }
  });
}

/** Actual svg base name for an icon name, honoring the light theme variant. */
function resolveVariant(name: string): string {
  return materialIconState.isLight && LIGHT_VARIANT_ICONS.has(name) ? `${name}_light` : name;
}

const ID_RE = /(\sid=)(["'])(.*?)\2/g;
const URL_RE = /url\(#([^)'"]+)\)/g;
let mountCounter = 0;

/**
 * Inline SVG markup for a material icon, sized `size`px. Fully synchronous;
 * returns an empty string only for unknown icon names (never a placeholder).
 */
export function materialIconSvg(name: string, size = 14): string {
  void materialIconState.version; // re-run consumers when the light/dark variant flips
  const raw = MATERIAL_ICON_SVGS.get(resolveVariant(name));
  if (raw == null) return '';

  // Namespace ids/url(#) refs per call so duplicated inline copies don't clash.
  const ns = `mi${++mountCounter}`;
  const svg = raw
    .replace(/^\s*<\?xml[^>]*\?>\s*/i, '')
    .replace(ID_RE, (_m, pre: string, q: string, id: string) => `${pre}${q}${ns}-${id}${q}`)
    .replace(URL_RE, (_m, id: string) => `url(#${ns}-${id})`);

  // Force the display size on the root <svg> (source files only have viewBox).
  const setAttr = (attrs: string, name: string): string => {
    const re = new RegExp(`${name}=["'][^"']*["']`, 'i');
    return re.test(attrs) ? attrs.replace(re, `${name}="${size}"`) : `${attrs} ${name}="${size}"`;
  };
  return svg.replace(/<svg([^>]*)>/i, (_full, attrs: string) => `<svg${setAttr(setAttr(attrs, 'width'), 'height')}>`);
}

/** Inline SVG for a file entry by file name (e.g. `main.ts`). */
export function materialFileIconSvg(fileName: string, size = 14): string {
  return materialIconSvg(getMaterialIcon(fileName), size);
}

/**
 * Inline SVG for a folder entry by folder name. When `isOpen` is set and the
 * resolved icon ships an `-open` glyph (upstream's `folderNamesExpanded`),
 * the open variant is used — otherwise the closed one renders for both states.
 */
export function materialFolderIconSvg(
  folderName: string,
  size = 14,
  isOpen = false,
): string {
  const base = `folder-${getMaterialFolderIcon(folderName)}`;
  const name = isOpen && FOLDER_OPEN_ICONS.has(base) ? `${base}-open` : base;
  return materialIconSvg(resolveVariant(name), size);
}

/** Inline SVG for the workspace root entry (`folder-root`, with open variant). */
export function materialRootFolderIconSvg(size = 14, isOpen = false): string {
  const name =
    isOpen && FOLDER_OPEN_ICONS.has(ROOT_FOLDER_ICON) ? `${ROOT_FOLDER_ICON}-open` : ROOT_FOLDER_ICON;
  return materialIconSvg(resolveVariant(name), size);
}
