import { material, defaultSettingsMaterial } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "material";
export const label = "Material";
export const isDark = true;
export const uiTheme = "dark";
export const extension = material;
export const settings = defaultSettingsMaterial;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/material.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
