/**
 * Platform
 *
 * Utility helpers for platform.
 */

// Platform detection
//
// The webview has no synchronous Tauri OS API, but the user agent reliably
// identifies the host OS. Defaults to Windows — the primary dev target — so
// SSR/test environments behave deterministically.

import { PLATFORM_SHELLS, type TerminalType } from '../constants';

export type OsPlatform = 'windows' | 'macos' | 'linux';

export function detectOsPlatform(): OsPlatform {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = navigator.userAgent;
  if (/Win|WOW/.test(ua)) return 'windows';
  if (/Mac|iPhone|iPad/.test(ua)) return 'macos';
  if (/Linux|Android|CrOS/.test(ua)) return 'linux';
  return 'windows';
}

/** Shells the current OS can actually spawn, ordered by preference. */
export function getPlatformShells(): TerminalType[] {
  return PLATFORM_SHELLS[detectOsPlatform()];
}

/** Fallback shell when no valid preference is configured. */
export function getPlatformDefaultShell(): TerminalType {
  return getPlatformShells()[0];
}
