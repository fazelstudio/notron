import { darcula, defaultSettingsDarcula } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "darcula";
export const label = "Darcula";
export const isDark = true;
export const uiTheme = "dark";
export const extension = darcula;
export const settings = defaultSettingsDarcula;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/darcula.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
