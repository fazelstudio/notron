import { consoleDark, defaultSettingsConsoleDark } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "console-dark";
export const label = "Console Dark";
export const isDark = true;
export const uiTheme = "dark";
export const extension = consoleDark;
export const settings = defaultSettingsConsoleDark;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/console-dark.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
