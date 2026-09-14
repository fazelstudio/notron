import { quietlight, defaultSettingsQuietlight } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "quietlight";
export const label = "Quietlight";
export const isDark = false;
export const uiTheme = "light";
export const extension = quietlight;
export const settings = defaultSettingsQuietlight;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/quietlight.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
