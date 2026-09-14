import { bbedit, defaultSettingsBbedit } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "bbedit";
export const label = "BBEdit";
export const isDark = false;
export const uiTheme = "light";
export const extension = bbedit;
export const settings = defaultSettingsBbedit;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/bbedit.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
