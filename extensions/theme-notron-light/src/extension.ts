import { vscodeLight, defaultSettingsVscodeLight } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';

export const id = 'notron-light';
export const label = 'Notron Light';
export const isDark = false;
export const uiTheme = 'light';
export const extension = vscodeLight;
export const settings = defaultSettingsVscodeLight;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/notron-light.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
