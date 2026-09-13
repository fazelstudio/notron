/**
 * Terminal Contribution — Core vs Contrib separation
 *
 * Registers bottom panel terminal item. Mirrors the editor
 * `contrib/terminal/browser`.
 */

import { BOTTOM_PANEL_ITEMS } from '../../workbench/contributions';

if (BOTTOM_PANEL_ITEMS.find((i) => i.id === 'terminal') == null) {
  console.warn('[terminal/contribution] terminal panel missing');
}

export const terminalContrib = { panelId: 'terminal' };