/**
 * Vite Env.D
 *
 * Module file..
 */
/// <reference types="vite/client" />

declare module '@exercism/codemirror-lang-gleam';

// @exercism/codemirror-lang-gleam does not ship bundled TypeScript declarations.
declare module '@exercism/codemirror-lang-gleam' {
  import type { LanguageSupport } from '@codemirror/language';
  export function gleam(): LanguageSupport;
}
