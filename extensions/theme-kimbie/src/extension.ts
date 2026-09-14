import { kimbie, defaultSettingsKimbie } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "kimbie";
export const label = "Kimbie";
export const isDark = true;
export const uiTheme = "dark";
export const extension = kimbie;
export const settings = defaultSettingsKimbie;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/kimbie.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
