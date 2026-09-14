import { githubDark, defaultSettingsGithubDark } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "github-dark";
export const label = "GitHub Dark";
export const isDark = true;
export const uiTheme = "dark";
export const extension = githubDark;
export const settings = defaultSettingsGithubDark;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/github-dark.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
