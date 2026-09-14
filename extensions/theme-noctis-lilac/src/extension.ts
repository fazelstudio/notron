import { noctisLilac, defaultSettingsNoctisLilac } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "noctis-lilac";
export const label = "Noctis Lilac";
export const isDark = false;
export const uiTheme = "light";
export const extension = noctisLilac;
export const settings = defaultSettingsNoctisLilac;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/noctis-lilac.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
