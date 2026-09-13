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
  path: string;
  extensionId?: string;
  isHighContrast?: boolean;
}
export interface IconThemeContribution {
  id: string;
  label: string;
  path: string;
  extensionId?: string;
}

export interface ThemingDelegate {
  getActiveColorTheme(): ColorTheme;
  onDidChangeActiveColorTheme: Event<ColorTheme>;
  getContributedThemes?(): ThemeContribution[];
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
  const existing = contributedThemes.findIndex((theme) => theme.id === contrib.id);
  if (existing >= 0) contributedThemes[existing] = contrib;
  else contributedThemes.push(contrib);
  return toDisposable(() => {
    const idx = contributedThemes.findIndex((theme) => theme.id === contrib.id);
    if (idx !== -1) contributedThemes.splice(idx, 1);
  });
}

export function __registerIconTheme(contrib: IconThemeContribution): Disposable {
  contributedIconThemes.push(contrib);
  return toDisposable(() => {
    const idx = contributedIconThemes.indexOf(contrib);
    if (idx !== -1) contributedIconThemes.splice(idx, 1);
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
  return [...contributedIconThemes];
}

export function __getContributedProductIconThemes(): IconThemeContribution[] {
  return [...contributedProductIconThemes];
}

export function __clearTheming(): void {
  contributedThemes.length = 0;
  contributedIconThemes.length = 0;
  contributedProductIconThemes.length = 0;
  activeTheme = { id: 'editor-dark', kind: 'dark', label: 'Notron Dark' };
}

export const theming = {
  getActiveColorTheme,
  onDidChangeActiveColorTheme,
} as const;

export const themingNamespace = theming;
