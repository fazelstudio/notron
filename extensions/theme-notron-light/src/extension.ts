import { vscodeLight, defaultSettingsVscodeLight } from '@uiw/codemirror-themes-all';
import { registerTheme } from '../../../src/lib/theme/registry';
import { __registerTheme } from '../../../packages/notron-sdk/src/api/theming';

export const id = 'notron-light';
export const label = 'Notron Light';
export const isDark = false;
export const uiTheme = 'light';
export const extension = vscodeLight;
export const settings = defaultSettingsVscodeLight;

registerTheme(id, { extension, settings, isDark, label, uiTheme });
__registerTheme({ id, label, uiTheme, path: './themes/notron-light.ts' });
