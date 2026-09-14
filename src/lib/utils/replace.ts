/**
 * Find & Replace helpers shared by the editor's Replace All and the search
 * panel. The RegExp construction mirrors the Rust backend (`search.rs`).
 */

export interface ReplaceMatchOptions {
  query: string;
  replace: string;
  caseSensitive: boolean;
  useRegex: boolean;
  wholeWord: boolean;
}

/** Escape a literal query so it can be embedded in a RegExp safely. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a RegExp mirroring the Rust backend (`search.rs`):
 *  * literal queries are escaped and regex queries pass through,
 *  * whole-word wraps the pattern in `\b(?:...)\b`,
 *  * case sensitivity maps to the `i` flag.
 */
export function buildReplaceRegex(query: string, opts: { caseSensitive: boolean; useRegex: boolean; wholeWord: boolean }): RegExp {
  let pattern = opts.useRegex ? query : escapeRegExp(query);
  if (opts.wholeWord) pattern = `\\b(?:${pattern})\\b`;
  return new RegExp(pattern, opts.caseSensitive ? 'g' : 'gi');
}

/** Compute the replacement string for a matched substring (handles `$1` backrefs). */
export function applyReplacement(matched: string, re: RegExp, opts: { useRegex: boolean; replace: string }): string {
  const replacer = opts.useRegex ? opts.replace : opts.replace.replace(/\$/g, '$$');
  const oneShot = new RegExp(re.source, re.flags.replace('g', ''));
  return matched.replace(oneShot, replacer);
}
