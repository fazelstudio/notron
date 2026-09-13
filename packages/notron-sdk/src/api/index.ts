/**
 * API Index
 *
 * Central re-export for all extension API namespaces.
 */
export * from './types.js';
export * from './extensions.js';
export * from './events.js';
export * from './commands.js';
export * from './workspace.js';
export * from './menus.js';
export * from './theming.js';
export { views, viewsNamespace } from './views.js';
export type { ViewContainer, View, TreeDataProvider, ProviderResult as ViewProviderResult } from './views.js';
export { languages, languagesNamespace } from './languages.js';
export type {
  CompletionItem,
  CompletionItemProvider,
  HoverProvider,
  DefinitionProvider,
  DocumentFormattingEditProvider,
  DiagnosticCollection,
  Diagnostic,
  DiagnosticSeverity,
  LanguageConfiguration,
  Hover,
  Definition,
  TextEdit,
} from './languages.js';
export { window, windowNamespace } from './window.js';
export { debug, debugNamespace } from './debug.js';
export { tasks, tasksNamespace } from './tasks.js';
export { scm, scmNamespace } from './scm.js';
export { snippets, snippetsNamespace } from './snippets.js';
export { authentication, authenticationNamespace } from './authentication.js';
export { terminal, terminalNamespace } from './terminal.js';
export { extensions, extensionsNamespace } from './extensions.js';
