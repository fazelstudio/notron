/**
 * Theme Commands
 *
 * Registers theme selection via Command Palette and QuickPick.
 */

import { commandRegistry } from '../commands/registry';
import { dialogService } from '../services/dialogService';
import { getThemeOptions } from './registry';
import { settingsStore } from '../stores/settings.svelte';
import { themeStore } from '../stores/theme';

commandRegistry.register({
  id: 'workbench.action.selectTheme',
  label: 'Preferences: Color Theme',
  category: 'Preferences',
  keywords: ['theme', 'color', 'appearance', 'dark', 'light'],
  action: async () => {
    const items = getThemeOptions().map(t => ({
      id: t.id,
      label: t.label,
      description: t.uiTheme,
    }));

    const allItems = [{ id: 'system', label: 'System Default', description: 'follows OS' }, ...items];

    const picked = await dialogService.showQuickPick(allItems, { placeHolder: 'Select Color Theme' });
    if (picked && !Array.isArray(picked) && picked.id) {
      settingsStore.updateSetting('theme', picked.id);
      themeStore.setTheme(picked.id);
    }
  },
});
