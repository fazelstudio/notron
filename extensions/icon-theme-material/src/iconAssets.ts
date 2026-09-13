/**
 * Material icon SVG contents, embedded into the bundle at build time.
 *
 * `eager: true` + `?raw` inlines every file's markup as a string constant, so
 * icon resolution is fully synchronous — the first paint of any tree row, tab
 * or breadcrumb already contains its icon (no fetch phase, no pop-in).
 */

const modules = import.meta.glob('./assets/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const MATERIAL_ICON_SVGS: ReadonlyMap<string, string> = new Map(
  Object.entries(modules).map(([path, svg]) => {
    const base = path.split('/').pop() ?? '';
    return [base.slice(0, -4), svg];
  }),
);
