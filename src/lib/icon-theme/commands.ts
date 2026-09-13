/**
 * Icon Theme Commands
 *
 * Registers icon theme selection via Command Palette.
 */

import { commandRegistry } from '../commands/registry';
import { dialogService } from '../services/dialogService';
import { __getContributedIconThemes } from '../../../packages/notron-sdk/src/api/theming';
import { settingsStore } from '../stores/settings.svelte';

commandRegistry.register({
  id: 'workbench.action.selectIconTheme',
  label: 'Preferences: File Icon Theme',
  category: 'Preferences',
  keywords: ['icon', 'theme', 'file', 'material', 'lucide'],
  action: async () => {
    const contributed = __getContributedIconThemes();
    const all = [{ id: 'off', label: 'None' }, { id: 'default', label: 'Default (Lucide)' }, ...contributed.map(c => ({ id: c.id, label: c.label }))];
    const seen = new Set<string>();
    const items = all.filter(o => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    }).map(o => ({ id: o.id, label: o.label }));
    const picked = await dialogService.showQuickPick(items, { placeHolder: 'Select File Icon Theme' });
    if (picked && !Array.isArray(picked) && picked.id) {
      settingsStore.updateSetting('icon_theme', picked.id);
    }
  },
});
