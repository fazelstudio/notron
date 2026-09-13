/**
 * Dialog Store
 *
 * Promise-based state for the shared UI capabilities (Quick Pick and Input
 * Box). Features await a value instead of each building its own modal, and the
 * rendered dialogs stay dumb views over this store.
 */

import { writable } from 'svelte/store';

export interface QuickPickItem {
  id?: string;
  label: string;
  description?: string;
  detail?: string;
  picked?: boolean;
}

export interface QuickPickState {
  items: QuickPickItem[];
  placeHolder: string;
  canPickMany: boolean;
}

export interface InputBoxState {
  prompt: string;
  placeHolder: string;
  value: string;
  password: boolean;
  validateInput?: (value: string) => string | null | undefined;
}

/** Current quick pick request, or null when closed. */
export const quickPickState = writable<QuickPickState | null>(null);
/** Current input box request, or null when closed. */
export const inputBoxState = writable<InputBoxState | null>(null);

let quickPickResolver: ((value: QuickPickItem | QuickPickItem[] | undefined) => void) | null = null;
let inputBoxResolver: ((value: string | undefined) => void) | null = null;

export const dialogStore = {
  /** Open a quick pick and resolve with the selection (or undefined). */
  showQuickPick(
    items: QuickPickItem[],
    options?: { placeHolder?: string; canPickMany?: boolean }
  ): Promise<QuickPickItem | QuickPickItem[] | undefined> {
    quickPickResolver?.(undefined);
    quickPickState.set({
      items,
      placeHolder: options?.placeHolder ?? '',
      canPickMany: options?.canPickMany ?? false
    });
    return new Promise((resolve) => {
      quickPickResolver = resolve;
    });
  },

  resolveQuickPick(value: QuickPickItem | QuickPickItem[] | undefined): void {
    quickPickState.set(null);
    const resolve = quickPickResolver;
    quickPickResolver = null;
    resolve?.(value);
  },

  /** Open an input box and resolve with the entered value (or undefined). */
  showInputBox(options?: {
    prompt?: string;
    placeHolder?: string;
    value?: string;
    password?: boolean;
    validateInput?: (value: string) => string | null | undefined;
  }): Promise<string | undefined> {
    inputBoxResolver?.(undefined);
    inputBoxState.set({
      prompt: options?.prompt ?? '',
      placeHolder: options?.placeHolder ?? '',
      value: options?.value ?? '',
      password: options?.password ?? false,
      validateInput: options?.validateInput
    });
    return new Promise((resolve) => {
      inputBoxResolver = resolve;
    });
  },

  resolveInputBox(value: string | undefined): void {
    inputBoxState.set(null);
    const resolve = inputBoxResolver;
    inputBoxResolver = null;
    resolve?.(value);
  }
};
