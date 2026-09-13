/**
 * High Contrast
 *
 * High contrast strategy keeps one background for all regions and uses border for separation.
 */

/**
 * Build semantic aliases for high contrast mode.
 */
export function highContrastSemanticAliases(): Record<string, string> {
  const hcBorder = '#0078d4';
  const selection = '#0078d4';
  const baseRef = 'var(--nt-prim-bg-base)';
  const overlayRef = baseRef;
  const panelRef = baseRef;

  return {
    '--nt-titlebar-bg': baseRef,
    '--nt-activitybar-bg': baseRef,
    '--nt-sidebar-bg': baseRef,
    '--nt-sidebar-header-bg': baseRef,
    '--nt-editor-bg': baseRef,
    '--nt-tabbar-bg': baseRef,
    '--nt-tab-active-bg': baseRef,
    '--nt-tab-inactive-bg': baseRef,
    '--nt-statusbar-bg': baseRef,
    '--nt-panel-bg': panelRef,
    '--nt-overlay-bg': overlayRef,
    '--nt-titlebar-border': hcBorder,
    '--nt-activitybar-border': hcBorder,
    '--nt-sidebar-border': hcBorder,
    '--nt-editor-border': hcBorder,
    '--nt-tab-border': hcBorder,
    '--nt-statusbar-border': hcBorder,
    '--nt-panel-border': hcBorder,
    '--nt-overlay-border': hcBorder,
    '--nt-prim-border': hcBorder,
    '--nt-prim-border-strong': hcBorder,
    '--nt-selected-bg': selection,
    '--nt-editor-selection': selection,
    '--nt-prim-selection': selection,
  };
}
