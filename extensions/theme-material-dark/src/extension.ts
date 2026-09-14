import { materialDark, defaultSettingsMaterialDark } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "material-dark";
export const label = "Material Dark";
export const isDark = true;
export const uiTheme = "dark";
export const extension = materialDark;
export const settings = defaultSettingsMaterialDark;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/material-dark.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
