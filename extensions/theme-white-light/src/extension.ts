import { whiteLight, defaultSettingsWhiteLight } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "white-light";
export const label = "White Light";
export const isDark = false;
export const uiTheme = "light";
export const extension = whiteLight;
export const settings = defaultSettingsWhiteLight;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/white-light.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
