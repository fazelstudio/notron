import { xcodeLight, defaultSettingsXcodeLight } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "xcode-light";
export const label = "Xcode Light";
export const isDark = false;
export const uiTheme = "light";
export const extension = xcodeLight;
export const settings = defaultSettingsXcodeLight;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/xcode-light.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
