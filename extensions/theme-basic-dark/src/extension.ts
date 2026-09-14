import { basicDark, defaultSettingsBasicDark } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "basic-dark";
export const label = "Basic Dark";
export const isDark = true;
export const uiTheme = "dark";
export const extension = basicDark;
export const settings = defaultSettingsBasicDark;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/basic-dark.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
