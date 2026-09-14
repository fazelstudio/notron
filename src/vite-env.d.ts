/**
 * Vite Env Declarations
 *
 * Type declarations for Vite client types and external CodeMirror languages.
 */
/// <reference types="vite/client" />

declare module '@exercism/codemirror-lang-gleam';

// Provide local type declaration because the Gleam language package ships without types.
declare module '@exercism/codemirror-lang-gleam' {
  import type { LanguageSupport } from '@codemirror/language';
  export function gleam(): LanguageSupport;
}
