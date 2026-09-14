import { xcodeDark, defaultSettingsXcodeDark } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "xcode-dark";
export const label = "Xcode Dark";
export const isDark = true;
export const uiTheme = "dark";
export const extension = xcodeDark;
export const settings = defaultSettingsXcodeDark;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/xcode-dark.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
