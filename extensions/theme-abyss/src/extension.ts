import { abyss, defaultSettingsAbyss } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "abyss";
export const label = "Abyss";
export const isDark = true;
export const uiTheme = "dark";
export const extension = abyss;
export const settings = defaultSettingsAbyss;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/abyss.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
