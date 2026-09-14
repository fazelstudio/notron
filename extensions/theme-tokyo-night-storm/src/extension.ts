import { tokyoNightStorm, defaultSettingsTokyoNightStorm } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "tokyo-night-storm";
export const label = "Tokyo Night Storm";
export const isDark = true;
export const uiTheme = "dark";
export const extension = tokyoNightStorm;
export const settings = defaultSettingsTokyoNightStorm;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/tokyo-night-storm.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
