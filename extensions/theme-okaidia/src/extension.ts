import { okaidia, defaultSettingsOkaidia } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "okaidia";
export const label = "Okaidia";
export const isDark = true;
export const uiTheme = "dark";
export const extension = okaidia;
export const settings = defaultSettingsOkaidia;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/okaidia.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
