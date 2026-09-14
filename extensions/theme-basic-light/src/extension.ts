import { basicLight, defaultSettingsBasicLight } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "basic-light";
export const label = "Basic Light";
export const isDark = false;
export const uiTheme = "light";
export const extension = basicLight;
export const settings = defaultSettingsBasicLight;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/basic-light.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
