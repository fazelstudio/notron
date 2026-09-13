/**
 * Menu positioning
 *
 * Keeps popup menus inside the application viewport and moves them out of
 * ancestor stacking contexts by mounting them directly under document.body.
 */

export const MENU_VIEWPORT_GAP = 8;

export function portal(node: HTMLElement) {
  document.body.appendChild(node);

  return {
    destroy() {
      node.remove();
    },
  };
}

export function positionMenu(
  node: HTMLElement,
  preferred: { x: number; y: number },
  options: { anchor?: DOMRect; align?: 'left' | 'right' } = {},
) {
  const rect = node.getBoundingClientRect();
  const gap = MENU_VIEWPORT_GAP;
  let x = preferred.x;
  let y = preferred.y;

  if (options.anchor) {
    const anchor = options.anchor;
    x = options.align === 'right' ? anchor.right - rect.width : anchor.left;
    y = anchor.bottom + 4;
  }

  if (x + rect.width > window.innerWidth - gap) {
    x = options.anchor && options.align !== 'right'
      ? options.anchor.right - rect.width
      : x - rect.width;
  }
  if (y + rect.height > window.innerHeight - gap) {
    y = options.anchor ? (options.anchor.top - rect.height - 4) : y - rect.height;
  }

  x = Math.max(gap, Math.min(x, window.innerWidth - rect.width - gap));
  y = Math.max(gap, Math.min(y, window.innerHeight - rect.height - gap));

  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}
