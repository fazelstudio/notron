/**
 * Snippets
 *
 * Snippet contributions loaded from manifest and kept in memory.
 */
import type { Disposable } from './types.js';
import { toDisposable } from './types.js';

export type { SnippetContribution } from '../types/index.js';

export interface Snippet {
  prefix: string;
  description?: string;
  body: string | string[];
  scope?: string;
}

export interface SnippetContributionEntry {
  language: string;
  path: string;
  snippets?: Snippet[];
  extensionId?: string;
}

export interface SnippetsDelegate {
  getSnippets?(language: string): Snippet[];
  registerSnippets?(language: string, snippets: Snippet[]): Disposable;
}

let snippetsDelegate: SnippetsDelegate | null = null;

export function setSnippetsDelegate(d: SnippetsDelegate | null): void {
  snippetsDelegate = d;
}

export function getSnippetsDelegate(): SnippetsDelegate | null {
  return snippetsDelegate;
}

const snippetContributions: SnippetContributionEntry[] = [];
const languageSnippetMap = new Map<string, Snippet[]>();

export function __registerSnippetContribution(entry: SnippetContributionEntry): Disposable {
  if (!entry.language || !entry.path) {
    throw new TypeError('[snippets] language and path required');
  }
  snippetContributions.push(entry);
  if (entry.snippets && entry.snippets.length > 0) {
    const key = entry.language.toLowerCase();
    const arr = languageSnippetMap.get(key) ?? [];
    arr.push(...entry.snippets);
    languageSnippetMap.set(key, arr);
  }
  return toDisposable(() => {
    const idx = snippetContributions.indexOf(entry);
    if (idx !== -1) snippetContributions.splice(idx, 1);
    if (entry.snippets) {
      const key = entry.language.toLowerCase();
      const arr = languageSnippetMap.get(key);
      if (arr) {
        for (const s of entry.snippets) {
          const si = arr.indexOf(s);
          if (si !== -1) arr.splice(si, 1);
        }
        if (arr.length === 0) languageSnippetMap.delete(key);
      }
    }
  });
}

export function registerSnippets(language: string, snippets: Snippet[]): Disposable {
  if (!language || !language.trim()) throw new TypeError('[snippets] language required');
  if (!Array.isArray(snippets)) throw new TypeError('[snippets] snippets must be array');
  if (snippetsDelegate?.registerSnippets) {
    return snippetsDelegate.registerSnippets(language, snippets);
  }
  const key = language.toLowerCase();
  const arr = languageSnippetMap.get(key) ?? [];
  const before = [...arr];
  arr.push(...snippets);
  languageSnippetMap.set(key, arr);
  return toDisposable(() => {
    const cur = languageSnippetMap.get(key);
    if (cur) {
      for (const s of snippets) {
        const idx = cur.indexOf(s);
        if (idx !== -1) cur.splice(idx, 1);
      }
      if (cur.length === 0) languageSnippetMap.delete(key);
    }
    void before;
  });
}

export function getSnippetsForLanguage(language: string): Snippet[] {
  if (!language) return [];
  if (snippetsDelegate?.getSnippets) return snippetsDelegate.getSnippets(language);
  const key = language.toLowerCase();
  return [...(languageSnippetMap.get(key) ?? [])];
}

export function getAllSnippetContributions(): SnippetContributionEntry[] {
  return [...snippetContributions];
}

export function validateSnippet(snippet: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!snippet || typeof snippet !== 'object' || Array.isArray(snippet)) {
    return { valid: false, errors: ['snippet: must be object'] };
  }
  const s = snippet as Record<string, unknown>;
  if (typeof s.prefix !== 'string' || !s.prefix.trim()) errors.push('prefix: required non-empty string');
  if (s.description !== undefined && typeof s.description !== 'string') errors.push('description: must be string if provided');
  if (s.body === undefined) errors.push('body: required (string or string[])');
  else if (typeof s.body !== 'string' && !Array.isArray(s.body)) errors.push('body: must be string or string[]');
  else if (Array.isArray(s.body) && !(s.body as unknown[]).every((v) => typeof v === 'string')) {
    errors.push('body: array elements must be strings');
  }
  if (s.scope !== undefined && typeof s.scope !== 'string') errors.push('scope: must be string if provided');
  return { valid: errors.length === 0, errors };
}

export function __clearSnippets(): void {
  snippetContributions.length = 0;
  languageSnippetMap.clear();
}

export function __getLanguageSnippetMap(): Map<string, Snippet[]> {
  return languageSnippetMap;
}

export const snippets = {
  getSnippetsForLanguage,
  getAllSnippetContributions,
  registerSnippets,
  validateSnippet,
} as const;

export const snippetsNamespace = snippets;
