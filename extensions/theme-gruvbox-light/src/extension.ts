import { gruvboxLight, defaultSettingsGruvboxLight } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "gruvbox-light";
export const label = "Gruvbox Light";
export const isDark = false;
export const uiTheme = "light";
export const extension = gruvboxLight;
export const settings = defaultSettingsGruvboxLight;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/gruvbox-light.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
