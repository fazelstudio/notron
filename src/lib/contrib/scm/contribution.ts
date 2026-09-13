/**
 * SCM (Source Control) Contribution — Core vs Contrib separation
 *
 * Registers git/source-control view. Mirrors the editor `contrib/scm/browser`.
 */

import { ACTIVITY_BAR_ITEMS, SIDEBAR_VIEWS } from '../../workbench/contributions';

if (ACTIVITY_BAR_ITEMS.find((i) => i.viewId === 'git') == null) {
  console.warn('[scm/contribution] scm activity bar item missing');
}
if (SIDEBAR_VIEWS.find((v) => v.id === 'git') == null) {
  console.warn('[scm/contribution] scm view missing');
}

export const scmContrib = { viewId: 'git' };