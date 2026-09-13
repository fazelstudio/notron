/**
 * Snippet Completion
 *
 * CodeMirror completion source that turns the snippet registry into editor
 * completions. The engine is generic — snippets themselves are data registered
 * per language, so adding a snippet never touches this file.
 */

import { EditorState, type Extension } from '@codemirror/state';
import { snippetCompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete';
import { language } from '@codemirror/language';
import { snippetRegistry } from '../workbench/snippetRegistry';

function snippetSource(context: CompletionContext): { from: number; options: Completion[] } | null {
  const activeLanguage = context.state.facet(language);
  const languageId = activeLanguage?.name?.toLowerCase();
  if (!languageId) return null;

  const snippets = snippetRegistry.getForLanguage(languageId);
  if (snippets.length === 0) return null;

  const word = context.matchBefore(/[\w:.-]*/);
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;

  return {
    from: word.from,
    options: snippets.map((snippet) =>
      snippetCompletion(Array.isArray(snippet.body) ? snippet.body.join('\n') : snippet.body, {
        label: snippet.prefix,
        detail: snippet.description,
        type: 'keyword'
      })
    )
  };
}

/**
 * Registers the snippet source through the language-data facet so it composes
 * with any other completion source instead of overriding them.
 */
export function snippetCompletionExtensions(): Extension {
  return EditorState.languageData.of(() => [{ autocomplete: snippetSource }]);
}
