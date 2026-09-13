/**
 * Language Registry
 *
 * Central store for language contributions.
 */

export interface LanguageContribution {
  id: string;
  extensions: string[];
  aliases?: string[];
  filenames?: string[];
  load: (ext: string) => Promise<unknown>;
}

class LanguageRegistry {
  private languages = new Map<string, LanguageContribution>();

  register(contrib: LanguageContribution): { dispose: () => void } {
    this.languages.set(contrib.id, contrib);
    return {
      dispose: () => {
        if (this.languages.get(contrib.id) === contrib) this.languages.delete(contrib.id);
      }
    };
  }

  get(id: string): LanguageContribution | undefined {
    return this.languages.get(id);
  }

  getAll(): LanguageContribution[] {
    return [...this.languages.values()];
  }

  getByExtension(ext: string): LanguageContribution | undefined {
    for (const lang of this.languages.values()) {
      if (lang.extensions.includes(ext)) return lang;
    }
    return undefined;
  }
}

export const languageRegistry = new LanguageRegistry();