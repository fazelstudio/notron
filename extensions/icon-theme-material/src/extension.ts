/**
 * Icon Theme Material Extension
 *
 * Registers material icon theme via SDK and registry.
 */

import { registerIconTheme } from '../../../src/lib/icon-theme/registry';
import { __registerIconTheme } from '../../../packages/notron-sdk/src/api/theming';
import { getMaterialIcon } from './iconMap';
import { materialFileIconSvg, materialFolderIconSvg } from './iconRenderer.svelte';

const id = 'material';
const label = 'Material';

registerIconTheme({ id, label }, {
  getFileIcon: (name: string) => getMaterialIcon(name),
  getFileIconSvg: (name: string, size: number) => materialFileIconSvg(name, size),
  getFolderIconSvg: (name: string, size: number, isOpen: boolean) => materialFolderIconSvg(name, size, isOpen),
  isMaterial: true,
} as any);

__registerIconTheme({ id, label, path: './themes/material.json' });
