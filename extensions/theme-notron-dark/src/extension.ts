import { vscodeDark, defaultSettingsVscodeDark } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';

export const id = 'notron-dark';
export const label = 'Notron Dark';
export const isDark = true;
export const uiTheme = 'dark';
export const extension = vscodeDark;
export const settings = defaultSettingsVscodeDark;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/notron-dark.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
