/**
 * Theming
 *
 * Theme access with in-memory fallback and host delegation.
 */
import type { Disposable, Event } from './types.js';
import { Emitter, toDisposable } from './types.js';

export interface ColorTheme {
  kind: 'light' | 'dark';
  id: string;
  label?: string;
}

export interface ThemeContribution {
  id: string;
  label: string;
  uiTheme: 'light' | 'dark';
  path?: string;
  extensionId?: string;
  isHighContrast?: boolean;
  // Runtime payload — populated when an extension registers via SDK.
  extension?: unknown;
  settings?: unknown;
  isDark?: boolean;
}

export interface IconThemeContribution {
  id: string;
  label: string;
  path?: string;
  extensionId?: string;
}

export interface IconThemeProvider {
  getFileIcon?: (name: string) => unknown;
  getFileIconSvg?: (name: string, size: number) => string;
  getFolderIconSvg?: (name: string, size: number, isOpen: boolean) => string;
  getRootFolderIconSvg?: (size: number, isOpen: boolean) => string;
  isMaterial?: boolean;
  // Allow extra provider-specific keys.
  [key: string]: unknown;
}

export interface ThemingDelegate {
  getActiveColorTheme(): ColorTheme;
  onDidChangeActiveColorTheme: Event<ColorTheme>;
  getContributedThemes?(): ThemeContribution[];
  getContributedIconThemes?(): IconThemeContribution[];
  getIconThemeProvider?(id: string): IconThemeProvider | undefined;
}

let themingDelegate: ThemingDelegate | null = null;

export function setThemingDelegate(d: ThemingDelegate | null): void {
  themingDelegate = d;
}

export function getThemingDelegate(): ThemingDelegate | null {
  return themingDelegate;
}

let activeTheme: ColorTheme = { id: 'editor-dark', kind: 'dark', label: 'Notron Dark' };
const themeEmitter = new Emitter<ColorTheme>();

const contributedThemes: ThemeContribution[] = [];
const contributedIconThemes: IconThemeContribution[] = [];
const contributedProductIconThemes: IconThemeContribution[] = [];
const iconThemeProviders = new Map<string, IconThemeProvider>();

export function getActiveColorTheme(): ColorTheme {
  if (themingDelegate?.getActiveColorTheme) return themingDelegate.getActiveColorTheme();
  return { ...activeTheme };
}

export const onDidChangeActiveColorTheme: Event<ColorTheme> = (listener, thisArg, disposables) => {
  if (themingDelegate?.onDidChangeActiveColorTheme) {
    return themingDelegate.onDidChangeActiveColorTheme(listener as (e: ColorTheme) => unknown, thisArg, disposables);
  }
  return themeEmitter.event(listener as (e: ColorTheme) => unknown, thisArg, disposables);
};

export function __setActiveTheme(theme: ColorTheme): void {
  activeTheme = { ...theme };
  themeEmitter.fire({ ...activeTheme });
}

export function __getActiveThemeFallback(): ColorTheme {
  return { ...activeTheme };
}

export function __registerTheme(contrib: ThemeContribution): Disposable {
  // Merge with existing entry so manifest contributions (path only) and runtime
  // extension payloads (extension/settings) coalesce into one record.
  const idx = contributedThemes.findIndex((t) => t.id === contrib.id);
  if (idx >= 0) {
    contributedThemes[idx] = { ...contributedThemes[idx], ...contrib };
  } else {
    contributedThemes.push({ ...contrib });
  }
  const stored = contributedThemes[idx >= 0 ? idx : contributedThemes.length - 1]!;
  void stored;
  return toDisposable(() => {
    const cur = contributedThemes.findIndex((t) => t.id === contrib.id);
    if (cur !== -1) contributedThemes.splice(cur, 1);
  });
}

export function __registerIconTheme(contrib: IconThemeContribution, provider?: IconThemeProvider): Disposable {
  const idx = contributedIconThemes.findIndex((t) => t.id === contrib.id);
  if (idx >= 0) contributedIconThemes[idx] = { ...contributedIconThemes[idx], ...contrib };
  else contributedIconThemes.push({ ...contrib });
  if (provider) iconThemeProviders.set(contrib.id, provider);
  return toDisposable(() => {
    const cur = contributedIconThemes.findIndex((t) => t.id === contrib.id);
    if (cur !== -1) contributedIconThemes.splice(cur, 1);
    if (provider && iconThemeProviders.get(contrib.id) === provider) iconThemeProviders.delete(contrib.id);
  });
}

export function __registerProductIconTheme(contrib: IconThemeContribution): Disposable {
  contributedProductIconThemes.push(contrib);
  return toDisposable(() => {
    const idx = contributedProductIconThemes.indexOf(contrib);
    if (idx !== -1) contributedProductIconThemes.splice(idx, 1);
  });
}

export function __getContributedThemes(): ThemeContribution[] {
  if (themingDelegate?.getContributedThemes) return themingDelegate.getContributedThemes();
  return [...contributedThemes];
}

export function __getContributedIconThemes(): IconThemeContribution[] {
  if (themingDelegate?.getContributedIconThemes) return themingDelegate.getContributedIconThemes();
  return [...contributedIconThemes];
}

/** Return color themes contributed by the active extension set. */
export function getContributedThemes(): ThemeContribution[] {
  return __getContributedThemes();
}

/** Return file icon themes contributed by the active extension set. */
export function getContributedIconThemes(): IconThemeContribution[] {
  return __getContributedIconThemes();
}

export function __getContributedProductIconThemes(): IconThemeContribution[] {
  return [...contributedProductIconThemes];
}

export function __getIconThemeProvider(id: string): IconThemeProvider | undefined {
  if (themingDelegate?.getIconThemeProvider) {
    const viaDelegate = themingDelegate.getIconThemeProvider(id);
    if (viaDelegate) return viaDelegate;
  }
  return iconThemeProviders.get(id);
}

export function __clearTheming(): void {
  contributedThemes.length = 0;
  contributedIconThemes.length = 0;
  contributedProductIconThemes.length = 0;
  iconThemeProviders.clear();
  activeTheme = { id: 'editor-dark', kind: 'dark', label: 'Notron Dark' };
}

// Public SDK surface for extensions — stable names without __ prefix.

/**
 * Register a color theme at runtime. Extensions should call this from `activate()`
 * instead of importing core registries.
 */
export function registerTheme(contrib: ThemeContribution): Disposable {
  return __registerTheme(contrib);
}

/**
 * Register an icon theme at runtime with an optional icon provider.
 */
export function registerIconTheme(contrib: IconThemeContribution, provider?: IconThemeProvider): Disposable {
  return __registerIconTheme(contrib, provider);
}

export const theming = {
  getActiveColorTheme,
  onDidChangeActiveColorTheme,
  getContributedThemes,
  getContributedIconThemes,
  registerTheme,
  registerIconTheme,
} as const;

export const themingNamespace = theming;
