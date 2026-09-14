import { consoleLight, defaultSettingsConsoleLight } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "console-light";
export const label = "Console Light";
export const isDark = false;
export const uiTheme = "light";
export const extension = consoleLight;
export const settings = defaultSettingsConsoleLight;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/console-light.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
