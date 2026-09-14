import { tokyoNight, defaultSettingsTokyoNight } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "tokyo-night";
export const label = "Tokyo Night";
export const isDark = true;
export const uiTheme = "dark";
export const extension = tokyoNight;
export const settings = defaultSettingsTokyoNight;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/tokyo-night.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
