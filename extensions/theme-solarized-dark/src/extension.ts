import { solarizedDark, defaultSettingsSolarizedDark } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "solarized-dark";
export const label = "Solarized Dark";
export const isDark = true;
export const uiTheme = "dark";
export const extension = solarizedDark;
export const settings = defaultSettingsSolarizedDark;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/solarized-dark.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
