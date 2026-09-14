import { monokaiDimmed, defaultSettingsMonokaiDimmed } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "monokai-dimmed";
export const label = "Monokai Dimmed";
export const isDark = true;
export const uiTheme = "dark";
export const extension = monokaiDimmed;
export const settings = defaultSettingsMonokaiDimmed;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/monokai-dimmed.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
