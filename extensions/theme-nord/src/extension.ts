import { nord, defaultSettingsNord } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "nord";
export const label = "Nord";
export const isDark = true;
export const uiTheme = "dark";
export const extension = nord;
export const settings = defaultSettingsNord;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/nord.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
