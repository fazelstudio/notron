import { eclipse, defaultSettingsEclipse } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "eclipse";
export const label = "Eclipse";
export const isDark = false;
export const uiTheme = "light";
export const extension = eclipse;
export const settings = defaultSettingsEclipse;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/eclipse.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
