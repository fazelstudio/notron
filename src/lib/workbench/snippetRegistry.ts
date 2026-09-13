/**
 * Snippet Registry
 *
 * Central store for per-language snippets. Each language registers its snippets
 * as data (JSON-like), without touching the snippet engine.
 * Mirrors VS Code's snippet contribution (data per language).
 */

export interface Snippet {
  /** Snippet prefix that triggers completion */
  prefix: string;
  /** Human-readable description */
  description?: string;
  /** Snippet body — string or lines; supports tabstops like $1, $0 */
  body: string | string[];
  /** Optional scope override (language id) */
  scope?: string;
}

export interface SnippetContribution {
  /** Language id (e.g. javascript, python) */
  language: string;
  /** Array of snippets for this language */
  snippets: Snippet[];
  /** Priority — lower first when merging */
  priority?: number;
}

class SnippetRegistry {
  private contributions: SnippetContribution[] = [];
  private listeners = new Set<() => void>();

  register(contrib: SnippetContribution): { dispose: () => void } {
    this.contributions.push(contrib);
    this.contributions.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    this.notify();
    return {
      dispose: () => {
        this.contributions = this.contributions.filter((c) => c !== contrib);
        this.notify();
      }
    };
  }

  registerAll(contribs: SnippetContribution[]): { dispose: () => void } {
    const disposables = contribs.map((c) => this.register(c));
    return { dispose: () => disposables.forEach((d) => d.dispose()) };
  }

  /** All snippets for a given language */
  getForLanguage(language: string): Snippet[] {
    const lang = language.toLowerCase();
    return this.contributions
      .filter((c) => c.language.toLowerCase() === lang)
      .flatMap((c) => c.snippets);
  }

  getAll(): SnippetContribution[] {
    return [...this.contributions];
  }

  onDidChange(listener: () => void): { dispose: () => void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}

export const snippetRegistry = new SnippetRegistry();
