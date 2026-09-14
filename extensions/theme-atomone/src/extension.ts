import { atomone, defaultSettingsAtomone } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "atomone";
export const label = "Atom One";
export const isDark = true;
export const uiTheme = "dark";
export const extension = atomone;
export const settings = defaultSettingsAtomone;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/atomone.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
