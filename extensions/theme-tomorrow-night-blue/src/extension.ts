import { tomorrowNightBlue, defaultSettingsTomorrowNightBlue } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "tomorrow-night-blue";
export const label = "Tomorrow Night Blue";
export const isDark = true;
export const uiTheme = "dark";
export const extension = tomorrowNightBlue;
export const settings = defaultSettingsTomorrowNightBlue;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/tomorrow-night-blue.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
