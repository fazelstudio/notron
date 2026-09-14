import { tokyoNightDay, defaultSettingsTokyoNightDay } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "tokyo-night-day";
export const label = "Tokyo Night Day";
export const isDark = false;
export const uiTheme = "light";
export const extension = tokyoNightDay;
export const settings = defaultSettingsTokyoNightDay;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/tokyo-night-day.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
