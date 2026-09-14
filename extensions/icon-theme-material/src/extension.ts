/**
 * Icon Theme Material Extension
 *
 * Registers material icon theme via SDK only.
 */

import { theming, type ExtensionContext } from 'notron-sdk';
import { getMaterialIcon } from './iconMap';
import { materialFileIconSvg, materialFolderIconSvg } from './iconRenderer.svelte';

const id = 'material';
const label = 'Material';

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(
    theming.registerIconTheme(
      { id, label, path: './themes/material.json' },
      {
        getFileIcon: (name: string) => getMaterialIcon(name),
        getFileIconSvg: (name: string, size: number) => materialFileIconSvg(name, size),
        getFolderIconSvg: (name: string, size: number, isOpen: boolean) =>
          materialFolderIconSvg(name, size, isOpen),
        isMaterial: true,
      } as any,
    ),
  );
}

export async function deactivate(): Promise<void> {}
