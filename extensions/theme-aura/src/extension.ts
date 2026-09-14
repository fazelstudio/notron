import { aura, defaultSettingsAura } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "aura";
export const label = "Aura";
export const isDark = true;
export const uiTheme = "dark";
export const extension = aura;
export const settings = defaultSettingsAura;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/aura.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
