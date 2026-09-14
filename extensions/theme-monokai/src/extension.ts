import { monokai, defaultSettingsMonokai } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "monokai";
export const label = "Monokai";
export const isDark = true;
export const uiTheme = "dark";
export const extension = monokai;
export const settings = defaultSettingsMonokai;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/monokai.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
