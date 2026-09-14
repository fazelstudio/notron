import { copilot, defaultSettingsCopilot } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "copilot";
export const label = "Copilot";
export const isDark = true;
export const uiTheme = "dark";
export const extension = copilot;
export const settings = defaultSettingsCopilot;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/copilot.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
