import { bespin, defaultSettingsBespin } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "bespin";
export const label = "Bespin";
export const isDark = true;
export const uiTheme = "dark";
export const extension = bespin;
export const settings = defaultSettingsBespin;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/bespin.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
