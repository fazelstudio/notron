/**
 * Icon Theme Registry
 *
 * Core icon themes are off and default (lucide). Material and others are
 * contributed via built-in extensions and registered through SDK.
 */

import { __registerIconTheme, __getIconThemeProvider, __getContributedIconThemes } from 'notron-sdk';
import { getFileIcon as getDefaultFileIcon } from './default';

export interface IconThemeInfo {
  id: string;
  label: string;
  isCore?: boolean;
}

export type IconProvider = {
  getFileIcon?: (name: string) => any;
  getFileIconSvg?: (name: string, size: number) => string;
  getFolderIconSvg?: (name: string, size: number, isOpen: boolean) => string;
  isMaterial?: boolean;
  [key: string]: unknown;
};

const providers = new Map<string, IconProvider>();

const coreThemes: Record<string, IconThemeInfo> = {
  'off': { id: 'off', label: 'None', isCore: true },
  'default': { id: 'default', label: 'Default (Lucide)', isCore: true },
};

export const ICON_THEMES: Record<string, IconThemeInfo> = { ...coreThemes };

// Mirror core themes into SDK so SDK query APIs list them.
for (const [id, info] of Object.entries(coreThemes)) {
  try { __registerIconTheme({ id, label: info.label, path: `./icon-themes/${id}.ts` }); } catch {}
}

providers.set('default', { getFileIcon: getDefaultFileIcon });
providers.set('off', {});

function mergedThemes(): Record<string, IconThemeInfo> {
  const out: Record<string, IconThemeInfo> = { ...ICON_THEMES };
  try {
    for (const c of __getContributedIconThemes()) {
      if (!out[c.id]) out[c.id] = { id: c.id, label: c.label };
    }
  } catch {}
  return out;
}

export function registerIconTheme(info: IconThemeInfo, provider?: IconProvider): void {
  ICON_THEMES[info.id] = info;
  if (provider) providers.set(info.id, provider);
  try {
    __registerIconTheme({ id: info.id, label: info.label, path: `./icon-themes/${info.id}.ts` }, provider as any);
  } catch {}
}

export function getIconProvider(id: string): IconProvider | undefined {
  const local = providers.get(id);
  if (local) return local;
  try {
    const sdk = __getIconThemeProvider(id) as unknown as IconProvider | undefined;
    if (sdk) return sdk;
  } catch {}
  return undefined;
}

export function hasIconProvider(id: string): boolean {
  if (providers.has(id)) return true;
  try { return !!__getIconThemeProvider(id); } catch { return false; }
}

export function getIconTheme(id: string): IconThemeInfo | undefined {
  return mergedThemes()[id];
}

export function getAllIconThemes(): Record<string, IconThemeInfo> {
  return mergedThemes();
}

export function getFileIconForTheme(_name: string, themeId: string): any {
  if (themeId === 'off') return null;
  return null;
}

export function isIconThemeRegistered(id: string): boolean {
  return id in mergedThemes();
}
