import { gruvboxDark, defaultSettingsGruvboxDark } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "gruvbox-dark";
export const label = "Gruvbox Dark";
export const isDark = true;
export const uiTheme = "dark";
export const extension = gruvboxDark;
export const settings = defaultSettingsGruvboxDark;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/gruvbox-dark.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
