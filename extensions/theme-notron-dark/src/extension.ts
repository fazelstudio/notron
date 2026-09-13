import { vscodeDark, defaultSettingsVscodeDark } from '@uiw/codemirror-themes-all';
import { registerTheme } from '../../../src/lib/theme/registry';
import { __registerTheme } from '../../../packages/notron-sdk/src/api/theming';

export const id = 'notron-dark';
export const label = 'Notron Dark';
export const isDark = true;
export const uiTheme = 'dark';
export const extension = vscodeDark;
export const settings = defaultSettingsVscodeDark;

registerTheme(id, { extension, settings, isDark, label, uiTheme });
__registerTheme({ id, label, uiTheme, path: './themes/notron-dark.ts' });
