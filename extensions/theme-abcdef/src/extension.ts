import { abcdef, defaultSettingsAbcdef } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "abcdef";
export const label = "Abcdef";
export const isDark = true;
export const uiTheme = "dark";
export const extension = abcdef;
export const settings = defaultSettingsAbcdef;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/abcdef.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
