/**
 * Languages
 *
 * Language features with diagnostics and configuration in memory; provider registration is deferred.
 */
import type { Disposable, Event, DocumentSelector } from './types.js';
import { Emitter, toDisposable } from './types.js';

import type { Position as SDKPosition, Range as SDKRange } from '../types/index.js';

export type Position = SDKPosition;
export type Range = SDKRange;

export interface TextDocument {
  uri: string;
  languageId: string;
  getText(range?: Range): string;
  lineCount: number;
}

export interface CancellationToken {
  isCancellationRequested: boolean;
  onCancellationRequested: Event<void>;
}

export interface CompletionContext {
  triggerKind: CompletionTriggerKind;
  triggerCharacter?: string;
}

export enum CompletionTriggerKind {
  Invoke = 0,
  TriggerCharacter = 1,
  TriggerForIncompleteCompletions = 2,
}

export interface CompletionItem {
  label: string;
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  range?: Range;
  sortText?: string;
  filterText?: string;
}

export enum CompletionItemKind {
  Text = 0, Method = 1, Function = 2, Constructor = 3, Field = 4, Variable = 5,
  Class = 6, Interface = 7, Module = 8, Property = 9, Unit = 10, Value = 11,
  Enum = 12, Keyword = 13, Snippet = 14, Color = 15, Reference = 17, File = 16,
  Folder = 18, EnumMember = 19, Constant = 20, Struct = 21, Event = 22, Operator = 23, TypeParameter = 24
}

export interface CompletionList {
  items: CompletionItem[];
  isIncomplete?: boolean;
}

export type ProviderResult<T> = T | Promise<T> | undefined | null;

export interface CompletionItemProvider {
  provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
    context: CompletionContext,
  ): ProviderResult<CompletionItem[] | CompletionList>;
  resolveCompletionItem?(item: CompletionItem, token: CancellationToken): ProviderResult<CompletionItem>;
}

export interface Hover {
  contents: string | { language: string; value: string } | Array<string | { language: string; value: string }>;
  range?: Range;
}

export interface HoverProvider {
  provideHover(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Hover>;
}

export interface Location {
  uri: string;
  range: Range;
}
export type Definition = Location | Location[];
export interface DefinitionProvider {
  provideDefinition(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Definition>;
}

export interface TextEdit {
  range: Range;
  newText: string;
}
export interface FormattingOptions {
  tabSize: number;
  insertSpaces: boolean;
}
export interface DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(
    document: TextDocument,
    options: FormattingOptions,
    token: CancellationToken,
  ): ProviderResult<TextEdit[]>;
}

export interface Diagnostic {
  range: Range;
  message: string;
  severity?: DiagnosticSeverity;
  source?: string;
  code?: string | number;
}

export enum DiagnosticSeverity {
  Error = 0, Warning = 1, Information = 2, Hint = 3
}

export interface DiagnosticCollection extends Disposable {
  name: string;
  set(uri: string, diagnostics: Diagnostic[] | undefined): void;
  get(uri: string): Diagnostic[] | undefined;
  has(uri: string): boolean;
  delete(uri: string): void;
  clear(): void;
  forEach(callback: (uri: string, diagnostics: Diagnostic[]) => void): void;
}

export interface LanguageConfiguration {
  comments?: { lineComment?: string; blockComment?: [string, string] };
  brackets?: Array<[string, string]>;
  autoClosingPairs?: Array<{ open: string; close: string; notIn?: string[] }>;
  surroundingPairs?: Array<[string, string]>;
  wordPattern?: RegExp;
  indentationRules?: { increaseIndentPattern: RegExp; decreaseIndentPattern: RegExp };
  onEnterRules?: unknown[];
}

export interface LanguagesDelegate {
  registerCompletionItemProvider?(
    selector: DocumentSelector,
    provider: CompletionItemProvider,
    triggerChars: string[],
  ): Disposable;
  registerHoverProvider?(selector: DocumentSelector, provider: HoverProvider): Disposable;
  registerDefinitionProvider?(selector: DocumentSelector, provider: DefinitionProvider): Disposable;
  registerDocumentFormattingEditProvider?(
    selector: DocumentSelector,
    provider: DocumentFormattingEditProvider,
  ): Disposable;
}

let languagesDelegate: LanguagesDelegate | null = null;
let warnedStub = false;

function warnStubOnce(feature: string): void {
  if (warnedStub) return;
  warnedStub = true;
  console.warn(
    `[languages] ${feature} is registered in SDK in-memory registry, but Notron core does not yet wire it to CodeMirror 6. ` +
      'Highlighting per language IS modular (languageDetector.ts), but provider runtime (autocomplete/hover/definition/formatting) ' +
      'requires a CodeMirror extension bridge (editorExtensionRegistry/compartment) — marked as high-priority gap (see IMPLEMENTATION_LOG Phase 3).',
  );
}

export function setLanguagesDelegate(d: LanguagesDelegate | null): void {
  languagesDelegate = d;
}

export function getLanguagesDelegate(): LanguagesDelegate | null {
  return languagesDelegate;
}

interface CompletionEntry {
  selector: DocumentSelector;
  provider: CompletionItemProvider;
  triggerChars: string[];
  extensionId?: string;
}
interface HoverEntry { selector: DocumentSelector; provider: HoverProvider; }
interface DefinitionEntry { selector: DocumentSelector; provider: DefinitionProvider; }
interface FormattingEntry { selector: DocumentSelector; provider: DocumentFormattingEditProvider; }

const completionProviders: CompletionEntry[] = [];
const hoverProviders: HoverEntry[] = [];
const definitionProviders: DefinitionEntry[] = [];
const formattingProviders: FormattingEntry[] = [];
const languageConfigs = new Map<string, LanguageConfiguration>();

interface DeclaredLanguage { id: string; extensions: string[]; aliases?: string[]; configuration?: string; }
interface DeclaredGrammar { language: string; scopeName: string; path: string; }
const declaredLanguages = new Map<string, DeclaredLanguage>();
const declaredGrammars: DeclaredGrammar[] = [];

function normalizeSelector(s: DocumentSelector): DocumentSelector {
  return s;
}

export function matchesSelector(selector: DocumentSelector, document: { languageId?: string; uri?: string }): boolean {
  const selectors = Array.isArray(selector) ? selector : [selector as string | { language?: string }];
  for (const sel of selectors) {
    if (typeof sel === 'string') {
      if (sel === '*' || sel === document.languageId) return true;
      continue;
    }
    const s = sel as { language?: string; pattern?: string };
    if (s.language && s.language === document.languageId) return true;
    if (s.pattern && document.uri) {
      try {
        const re = new RegExp('^' + s.pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        if (re.test(document.uri)) return true;
      } catch { /* ignore */ }
    }
    if (!s.language && !s.pattern) return true;
  }
  return false;
}

export function registerCompletionItemProvider(
  selector: DocumentSelector,
  provider: CompletionItemProvider,
  ...triggerChars: string[]
): Disposable {
  if (!selector) throw new TypeError('[languages] selector required');
  if (!provider || typeof provider.provideCompletionItems !== 'function') {
    throw new TypeError('[languages] provider must implement provideCompletionItems');
  }
  if (languagesDelegate?.registerCompletionItemProvider) {
    return languagesDelegate.registerCompletionItemProvider(selector, provider, triggerChars);
  }
  warnStubOnce('registerCompletionItemProvider');
  const entry: CompletionEntry = { selector: normalizeSelector(selector), provider, triggerChars };
  completionProviders.push(entry);
  return toDisposable(() => {
    const idx = completionProviders.indexOf(entry);
    if (idx !== -1) completionProviders.splice(idx, 1);
  });
}

export function registerHoverProvider(selector: DocumentSelector, provider: HoverProvider): Disposable {
  if (!selector) throw new TypeError('[languages] selector required');
  if (!provider || typeof provider.provideHover !== 'function') {
    throw new TypeError('[languages] provider must implement provideHover');
  }
  if (languagesDelegate?.registerHoverProvider) {
    return languagesDelegate.registerHoverProvider(selector, provider);
  }
  warnStubOnce('registerHoverProvider');
  const entry: HoverEntry = { selector: normalizeSelector(selector), provider };
  hoverProviders.push(entry);
  return toDisposable(() => {
    const idx = hoverProviders.indexOf(entry);
    if (idx !== -1) hoverProviders.splice(idx, 1);
  });
}

export function registerDefinitionProvider(selector: DocumentSelector, provider: DefinitionProvider): Disposable {
  if (!selector) throw new TypeError('[languages] selector required');
  if (!provider || typeof provider.provideDefinition !== 'function') {
    throw new TypeError('[languages] provider must implement provideDefinition');
  }
  if (languagesDelegate?.registerDefinitionProvider) {
    return languagesDelegate.registerDefinitionProvider(selector, provider);
  }
  warnStubOnce('registerDefinitionProvider');
  const entry: DefinitionEntry = { selector: normalizeSelector(selector), provider };
  definitionProviders.push(entry);
  return toDisposable(() => {
    const idx = definitionProviders.indexOf(entry);
    if (idx !== -1) definitionProviders.splice(idx, 1);
  });
}

export function registerDocumentFormattingEditProvider(
  selector: DocumentSelector,
  provider: DocumentFormattingEditProvider,
): Disposable {
  if (!selector) throw new TypeError('[languages] selector required');
  if (!provider || typeof provider.provideDocumentFormattingEdits !== 'function') {
    throw new TypeError('[languages] provider must implement provideDocumentFormattingEdits');
  }
  if (languagesDelegate?.registerDocumentFormattingEditProvider) {
    return languagesDelegate.registerDocumentFormattingEditProvider(selector, provider);
  }
  warnStubOnce('registerDocumentFormattingEditProvider');
  const entry: FormattingEntry = { selector: normalizeSelector(selector), provider };
  formattingProviders.push(entry);
  return toDisposable(() => {
    const idx = formattingProviders.indexOf(entry);
    if (idx !== -1) formattingProviders.splice(idx, 1);
  });
}

export function setLanguageConfiguration(languageId: string, configuration: LanguageConfiguration): Disposable {
  if (!languageId || !languageId.trim()) throw new TypeError('[languages] languageId must be non-empty string');
  if (!configuration || typeof configuration !== 'object') throw new TypeError('[languages] configuration must be object');
  const prev = languageConfigs.get(languageId);
  languageConfigs.set(languageId, configuration);
  return toDisposable(() => {
    if (languageConfigs.get(languageId) === configuration) {
      if (prev) languageConfigs.set(languageId, prev);
      else languageConfigs.delete(languageId);
    }
  });
}

class DiagnosticCollectionImpl implements DiagnosticCollection {
  private map = new Map<string, Diagnostic[]>();
  private disposed = false;
  private emitter = new Emitter<void>();

  constructor(public readonly name: string) {}

  set(uri: string, diagnostics: Diagnostic[] | undefined): void {
    if (this.disposed) return;
    if (!uri) throw new TypeError('[DiagnosticCollection] uri required');
    if (diagnostics === undefined || diagnostics.length === 0) {
      this.map.delete(uri);
    } else {
      this.map.set(uri, [...diagnostics]);
    }
    this.emitter.fire();
  }

  get(uri: string): Diagnostic[] | undefined {
    const d = this.map.get(uri);
    return d ? [...d] : undefined;
  }

  has(uri: string): boolean {
    return this.map.has(uri);
  }

  delete(uri: string): void {
    this.map.delete(uri);
    this.emitter.fire();
  }

  clear(): void {
    this.map.clear();
    this.emitter.fire();
  }

  forEach(callback: (uri: string, diagnostics: Diagnostic[]) => void): void {
    for (const [uri, diags] of this.map) callback(uri, [...diags]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.map.clear();
    const idx = allCollections.indexOf(this);
    if (idx !== -1) allCollections.splice(idx, 1);
  }

  get onDidChange(): Event<void> {
    return this.emitter.event;
  }
}

const allCollections: DiagnosticCollectionImpl[] = [];

export function createDiagnosticCollection(name?: string): DiagnosticCollection {
  const col = new DiagnosticCollectionImpl(name ?? `diagnostics-${allCollections.length + 1}`);
  allCollections.push(col);
  return col;
}

export function __registerLanguage(lang: DeclaredLanguage): Disposable {
  if (!lang.id || !Array.isArray(lang.extensions)) {
    throw new TypeError('[languages] __registerLanguage: id and extensions required');
  }
  if (declaredLanguages.has(lang.id)) {
    console.warn(`[languages] overwriting declared language ${lang.id}`);
  }
  declaredLanguages.set(lang.id, { ...lang });
  return toDisposable(() => {
    if (declaredLanguages.get(lang.id)?.extensions === lang.extensions) {
      declaredLanguages.delete(lang.id);
    }
  });
}

export function __registerGrammar(grammar: DeclaredGrammar): Disposable {
  if (!grammar.language || !grammar.scopeName || !grammar.path) {
    throw new TypeError('[languages] __registerGrammar: language, scopeName, path required');
  }
  declaredGrammars.push(grammar);
  return toDisposable(() => {
    const idx = declaredGrammars.indexOf(grammar);
    if (idx !== -1) declaredGrammars.splice(idx, 1);
  });
}

export function __getCompletionProviders(): CompletionEntry[] { return [...completionProviders]; }
export function __getHoverProviders(): HoverEntry[] { return [...hoverProviders]; }
export function __getDefinitionProviders(): DefinitionEntry[] { return [...definitionProviders]; }
export function __getFormattingProviders(): FormattingEntry[] { return [...formattingProviders]; }
export function __getLanguageConfigurations(): Map<string, LanguageConfiguration> { return languageConfigs; }
export function __getDeclaredLanguages(): Map<string, DeclaredLanguage> { return declaredLanguages; }
export function __getDeclaredGrammars(): DeclaredGrammar[] { return [...declaredGrammars]; }
export function __getDiagnosticCollections(): DiagnosticCollectionImpl[] { return [...allCollections]; }
export function __clearLanguages(): void {
  completionProviders.length = 0;
  hoverProviders.length = 0;
  definitionProviders.length = 0;
  formattingProviders.length = 0;
  languageConfigs.clear();
  declaredLanguages.clear();
  declaredGrammars.length = 0;
  for (const c of [...allCollections]) c.dispose();
  allCollections.length = 0;
  warnedStub = false;
}

export const languages = {
  registerCompletionItemProvider,
  registerHoverProvider,
  registerDefinitionProvider,
  registerDocumentFormattingEditProvider,
  createDiagnosticCollection,
  setLanguageConfiguration,
  matchesSelector,
} as const;

export const languagesNamespace = languages;
