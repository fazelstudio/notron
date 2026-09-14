import { solarizedLight, defaultSettingsSolarizedLight } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "solarized-light";
export const label = "Solarized Light";
export const isDark = false;
export const uiTheme = "light";
export const extension = solarizedLight;
export const settings = defaultSettingsSolarizedLight;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/solarized-light.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
