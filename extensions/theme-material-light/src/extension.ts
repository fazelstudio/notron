import { materialLight, defaultSettingsMaterialLight } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "material-light";
export const label = "Material Light";
export const isDark = false;
export const uiTheme = "light";
export const extension = materialLight;
export const settings = defaultSettingsMaterialLight;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/material-light.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
