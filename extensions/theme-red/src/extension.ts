import { red, defaultSettingsRed } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "red";
export const label = "Red";
export const isDark = true;
export const uiTheme = "dark";
export const extension = red;
export const settings = defaultSettingsRed;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/red.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
