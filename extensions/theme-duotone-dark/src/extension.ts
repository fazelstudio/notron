import { duotoneDark, defaultSettingsDuotoneDark } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "duotone-dark";
export const label = "Duotone Dark";
export const isDark = true;
export const uiTheme = "dark";
export const extension = duotoneDark;
export const settings = defaultSettingsDuotoneDark;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/duotone-dark.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
