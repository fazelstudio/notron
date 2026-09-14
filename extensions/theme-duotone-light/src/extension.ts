import { duotoneLight, defaultSettingsDuotoneLight } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "duotone-light";
export const label = "Duotone Light";
export const isDark = false;
export const uiTheme = "light";
export const extension = duotoneLight;
export const settings = defaultSettingsDuotoneLight;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/duotone-light.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
