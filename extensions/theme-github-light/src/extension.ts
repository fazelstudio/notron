import { githubLight, defaultSettingsGithubLight } from '@uiw/codemirror-themes-all';
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "github-light";
export const label = "GitHub Light";
export const isDark = false;
export const uiTheme = "light";
export const extension = githubLight;
export const settings = defaultSettingsGithubLight;

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/github-light.ts", extension, settings, isDark }));
}

export async function deactivate(): Promise<void> {}
