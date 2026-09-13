/**
 * Debug/Run Contribution — Core vs Contrib separation
 *
 * Registers run/debug view. Mirrors the editor `contrib/debug/browser`.
 */

import { ACTIVITY_BAR_ITEMS, SIDEBAR_VIEWS } from '../../workbench/contributions';
// Register runnable tasks contributed by project layouts (npm, cargo, ...).
import './taskProviders';

if (ACTIVITY_BAR_ITEMS.find((i) => i.viewId === 'run') == null) {
  console.warn('[debug/contribution] run activity bar item missing');
}
if (SIDEBAR_VIEWS.find((v) => v.id === 'run') == null) {
  console.warn('[debug/contribution] run view missing');
}

export const debugContrib = { viewId: 'run' };