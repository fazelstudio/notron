import { androidstudio, defaultSettingsAndroidstudio } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "androidstudio";
export const label = "Android Studio";
export const isDark = true;
export const uiTheme = "dark";
export const extension = androidstudio;
export const settings = defaultSettingsAndroidstudio;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/androidstudio.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
