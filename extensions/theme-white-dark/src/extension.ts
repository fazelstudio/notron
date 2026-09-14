import { whiteDark, defaultSettingsWhiteDark } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "white-dark";
export const label = "White Dark";
export const isDark = true;
export const uiTheme = "dark";
export const extension = whiteDark;
export const settings = defaultSettingsWhiteDark;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/white-dark.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
