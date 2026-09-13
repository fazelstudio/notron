/**
 * Icon Theme Registry
 *
 * Core icon themes are off and default (lucide). Material and others are
 * contributed via built-in extensions and registered through SDK.
 */

import { __registerIconTheme } from '../../../packages/notron-sdk/src/api/theming';
import { getFileIcon as getDefaultFileIcon } from './default';

export interface IconThemeInfo {
  id: string;
  label: string;
  isCore?: boolean;
}

export type IconProvider = {
  getFileIcon?: (name: string) => any;
  getFileIconSvg?: (name: string, size: number) => string;
  isMaterial?: boolean;
};

const providers = new Map<string, IconProvider>();

const coreThemes: Record<string, IconThemeInfo> = {
  'off': { id: 'off', label: 'None', isCore: true },
  'default': { id: 'default', label: 'Default (Lucide)', isCore: true },
};

export const ICON_THEMES: Record<string, IconThemeInfo> = { ...coreThemes };

for (const [id, info] of Object.entries(coreThemes)) {
  __registerIconTheme({ id, label: info.label, path: `./icon-themes/${id}.ts` });
}

providers.set('default', { getFileIcon: getDefaultFileIcon });
providers.set('off', {});

export function registerIconTheme(info: IconThemeInfo, provider?: IconProvider): void {
  ICON_THEMES[info.id] = info;
  if (provider) providers.set(info.id, provider);
  __registerThemeIfNeeded(info);
}

function __registerThemeIfNeeded(info: IconThemeInfo): void {
  try {
    __registerIconTheme({ id: info.id, label: info.label, path: `./icon-themes/${info.id}.ts` });
  } catch {}
}

export function getIconProvider(id: string): IconProvider | undefined {
  return providers.get(id);
}

export function hasIconProvider(id: string): boolean {
  return providers.has(id);
}

export function getIconTheme(id: string): IconThemeInfo | undefined {
  return ICON_THEMES[id];
}

export function getAllIconThemes(): Record<string, IconThemeInfo> {
  return { ...ICON_THEMES };
}

export function getFileIconForTheme(_name: string, themeId: string): any {
  if (themeId === 'off') return null;
  return null;
}

export function isIconThemeRegistered(id: string): boolean {
  return id in ICON_THEMES;
}
