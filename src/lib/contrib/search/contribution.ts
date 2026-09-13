/**
 * Search Contribution — Core vs Contrib separation
 *
 * Registers search view and its commands. Mirrors the editor
 * `contrib/search/browser`.
 */

import { ACTIVITY_BAR_ITEMS, SIDEBAR_VIEWS } from '../../workbench/contributions';

if (ACTIVITY_BAR_ITEMS.find((i) => i.viewId === 'search') == null) {
  console.warn('[search/contribution] search activity bar item missing');
}
if (SIDEBAR_VIEWS.find((v) => v.id === 'search') == null) {
  console.warn('[search/contribution] search view missing');
}

export const searchContrib = { viewId: 'search' };