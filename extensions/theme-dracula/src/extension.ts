import { dracula, defaultSettingsDracula } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "dracula";
export const label = "Dracula";
export const isDark = true;
export const uiTheme = "dark";
export const extension = dracula;
export const settings = defaultSettingsDracula;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/dracula.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
