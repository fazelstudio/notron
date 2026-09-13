/**
 * Markdown Preview — smoke test Phase 3 languages + menus + theming
 *
 * Exercises:
 *  - declarative contributes.languages / grammars / themes / menus / configuration (read via host/contributions & validateManifest)
 *  - languages.registerHoverProvider / registerCompletionItemProvider / createDiagnosticCollection / setLanguageConfiguration
 *  - menus.evaluateWhenClause (editor/title when clause: editorTextFocus && resourceExtname == .md)
 *  - theming.getActiveColorTheme / onDidChangeActiveColorTheme
 *  - window custom editor stub (registerCustomEditorProvider throws NotImplementedError until core webview exists) — caught and logged
 */

import { commands } from '../../../src/api/commands.js';
import { window } from '../../../src/api/window.js';
import { languages } from '../../../src/api/languages.js';
import { menus } from '../../../src/api/menus.js';
import { theming } from '../../../src/api/theming.js';
import type { ExtensionContext } from '../../../src/host/context.js';
import { NotImplementedError } from '../../../src/host/errors.js';

export async function activate(context: ExtensionContext): Promise<void> {
  const log = context.logChannel;
  log.appendLine('[markdown-preview] activating…');

  // -- theming smoke.
  const theme = theming.getActiveColorTheme();
  log.appendLine(`[markdown-preview] activeTheme=${theme.id} kind=${theme.kind}`);
  const themeDisp = theming.onDidChangeActiveColorTheme((t) => {
    log.appendLine(`[markdown-preview] themeChanged -> ${t.id}`);
  });
  context.subscriptions.push(themeDisp);

  // -- menus: evaluate when clause for editor/title toggle button.
  const ctx = { editorTextFocus: true, resourceExtname: '.md', view: 'editor' };
  const visible = menus.evaluateWhenClause('editorTextFocus && resourceExtname == .md', ctx);
  const hidden = menus.evaluateWhenClause('editorTextFocus && resourceExtname == .md', { editorTextFocus: true, resourceExtname: '.ts' });
  const paren = menus.evaluateWhenClause('(view == explorer || view == acme.markdownPreview) && !inputFocus', { view: 'explorer', inputFocus: false });
  log.appendLine(`[markdown-preview] when visible=${visible} hidden=${hidden} paren=${paren}`);

  // -- languages: setLanguageConfiguration (stub-noted but data stored)
  const cfgDisp = languages.setLanguageConfiguration('markdown', {
    comments: { lineComment: '<!-- -->' },
    brackets: [['[', ']'], ['(', ')']],
    autoClosingPairs: [{ open: '{', close: '}' }],
  });
  context.subscriptions.push(cfgDisp);
  log.appendLine('[markdown-preview] setLanguageConfiguration markdown done');

  // -- languages: hover provider for markdown.
  const hoverDisp = languages.registerHoverProvider({ language: 'markdown' } as never, {
    provideHover(doc, position) {
      const text = doc.getText();
      return { contents: `Preview hover at ${position.line}:${position.character} — ${text.slice(0, 20)}`, range: { start: position, end: position } as never };
    },
  });
  context.subscriptions.push(hoverDisp);
  log.appendLine('[markdown-preview] hoverProvider registered for markdown');

  // -- languages: completion provider (markdown)
  const compDisp = languages.registerCompletionItemProvider(
    { language: 'markdown' } as never,
    {
      provideCompletionItems(doc) {
        if (doc.languageId !== 'markdown') return;
        return [{ label: '# Heading', kind: 14, detail: 'Insert heading', insertText: '# ' }];
      },
    },
    '#',
  );
  context.subscriptions.push(compDisp);

  // -- languages: diagnostic collection (real CRUD)
  const diags = languages.createDiagnosticCollection('markdown-preview');
  context.subscriptions.push(diags);
  // Demo diagnostic: flag TODO.
  diags.set('file:///workspace/README.md', [
    { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } } as never, message: 'Demo diagnostic: check TODO', severity: 1 },
  ]);
  log.appendLine(`[markdown-preview] diags for README.md = ${diags.get('file:///workspace/README.md')?.length ?? 0}`);

  // -- window custom editor stub — expect NotImplementedError until core provides host webview.
  try {
    const custom = window.registerCustomEditorProvider('acme.markdownPreview', {
      async resolveCustomEditor() {},
    });
    context.subscriptions.push(custom);
    log.appendLine('[markdown-preview] customEditor registered (unexpected — stub was expected to throw)');
  } catch (err) {
    if (err instanceof NotImplementedError) {
      log.appendLine(`[markdown-preview] customEditor stub (expected): ${err.message.split('\n')[0]}`);
    } else {
      log.appendLine(`[markdown-preview] customEditor error: ${String(err)}`);
    }
  }

  // -- command: toggle preview.
  const toggle = commands.registerCommand('acme.markdownPreview.toggle', async () => {
    log.appendLine('[markdown-preview] toggle invoked');
    const msg = `Toggle preview — theme=${theming.getActiveColorTheme().id} whenVisible=${menus.evaluateWhenClause('resourceExtname == .md', { resourceExtname: '.md' })} diags=${diags.get('file:///workspace/README.md')?.length}`;
    log.appendLine(`[markdown-preview] ${msg}`);
    await window.showInformationMessage(msg);

    // Try webview panel stub — expected to throw until core implements.
    try {
      const panel = window.createWebviewPanel('acme.markdownPreview', 'Markdown Preview', { viewColumn: 2 });
      panel.webview.html = `<html><body><h1>Preview</h1><p>Markdown demo (${theme.id})</p></body></html>`;
      // Would reveal; dispose via subscriptions if succeeded (unexpected)
      context.subscriptions.push(panel);
    } catch (err) {
      if (err instanceof NotImplementedError) {
        log.appendLine('[markdown-preview] createWebviewPanel stub (expected) — fallback to output channel');
        const out = window.createOutputChannel('Markdown Preview');
        // Out lives for extension lifetime via subscriptions already; here we just log.
        out.appendLine(msg);
        out.show();
      } else {
        throw err;
      }
    }
  }, context.extensionId);
  context.subscriptions.push(toggle);

  // Output channel smoke.
  const out = window.createOutputChannel('Markdown Preview');
  context.subscriptions.push(out);
  out.appendLine('[markdown-preview] activated');

  log.appendLine('[markdown-preview] activated OK');
}

export async function deactivate(): Promise<void> {
  console.log('[markdown-preview] deactivated');
}
