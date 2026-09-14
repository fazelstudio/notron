/**
 * Appearance Extension
 *
 * Owns generic theme and icon theme selection through the public SDK.
 */

import {
  commands,
  theming,
  window,
  workspace,
  type ExtensionContext,
} from 'notron-sdk';

const SYSTEM_THEME = { id: 'system', label: 'System Default', description: 'follows OS' };
const CORE_ICON_THEMES = [
  { id: 'off', label: 'None' },
  { id: 'default', label: 'Default (Lucide)' },
];

function themeItems() {
  return [
    SYSTEM_THEME,
    ...theming.getContributedThemes().map((theme) => ({
      id: theme.id,
      label: theme.label,
      description: theme.uiTheme,
    })),
  ];
}

function iconThemeItems() {
  const seen = new Set<string>();
  return [...CORE_ICON_THEMES, ...theming.getContributedIconThemes().map((theme) => ({
    id: theme.id,
    label: theme.label,
  }))].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function configuration(context: ExtensionContext) {
  return workspace.registerConfiguration(
    {
      title: 'Appearance',
      category: 'appearance',
      properties: {
        theme: {
          type: 'string',
          default: 'system',
          description: 'Controls the overall color scheme of the application.',
          enum: themeItems().map((item) => item.id),
        },
        icon_theme: {
          type: 'string',
          default: 'default',
          description: 'File icons displayed in the explorer sidebar.',
          enum: iconThemeItems().map((item) => item.id),
        },
      },
    },
    context.extensionId,
  );
}

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(configuration(context));
  context.subscriptions.push(
    commands.registerCommand('workbench.action.selectTheme', async () => {
      const picked = await window.showQuickPick(themeItems(), { placeHolder: 'Select Color Theme' });
      if (picked && !Array.isArray(picked) && picked.id) {
        await workspace.getConfiguration().update('theme', picked.id);
      }
    }),
  );
  context.subscriptions.push(
    commands.registerCommand('workbench.action.selectIconTheme', async () => {
      const picked = await window.showQuickPick(iconThemeItems(), { placeHolder: 'Select File Icon Theme' });
      if (picked && !Array.isArray(picked) && picked.id) {
        await workspace.getConfiguration().update('icon_theme', picked.id);
      }
    }),
  );
}

export async function deactivate(): Promise<void> {}
