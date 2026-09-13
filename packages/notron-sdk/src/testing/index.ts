/**
 * Testing
 *
 * In-memory mock host for extension tests.
 */
import { ExtensionContext } from '../host/context.js';
import type { ExtensionContextOptions } from '../host/context.js';
import { InMemoryMemento, InMemorySecretStorage } from '../host/memento.js';
import * as commandsApi from '../api/commands.js';
import * as windowApi from '../api/window.js';
import * as workspaceApi from '../api/workspace.js';
import * as viewsApi from '../api/views.js';
import * as menusApi from '../api/menus.js';
import * as languagesApi from '../api/languages.js';
import * as themingApi from '../api/theming.js';
import * as debugApi from '../api/debug.js';
import * as tasksApi from '../api/tasks.js';
import * as scmApi from '../api/scm.js';
import * as snippetsApi from '../api/snippets.js';
import * as authenticationApi from '../api/authentication.js';
import * as terminalApi from '../api/terminal.js';
import * as extensionsApi from '../api/extensions.js';

// Helpers: proxy namespace + helpers so `mock.window.__getShownMessages` works
// while preserving getters like `window.activeTextEditor`.

function withHelpers<T extends object>(ns: T, helpers: Record<string, unknown>): T & Record<string, unknown> {
 return new Proxy(ns as unknown as Record<string, unknown>, {
 get(target, prop, receiver) {
 if (typeof prop === 'string' && prop in helpers) return helpers[prop];
 return Reflect.get(target as object, prop, receiver);
 },
 has(target, prop) {
 if (typeof prop === 'string' && prop in helpers) return true;
 return Reflect.has(target as object, prop);
 },
 ownKeys(target) {
 return [...Reflect.ownKeys(target as object), ...Reflect.ownKeys(helpers)];
 },
 getOwnPropertyDescriptor(target, prop) {
 if (typeof prop === 'string' && prop in helpers) {
 return Object.getOwnPropertyDescriptor(helpers, prop) ?? { configurable: true, enumerable: true, value: helpers[prop], writable: true };
 }
 return Reflect.getOwnPropertyDescriptor(target as object, prop);
 },
 }) as T & Record<string, unknown>;
}

// Global reset — clears every in-memory registry (for test isolation).
// Called automatically by createMockNotron({ reset: true }).

export function resetAllMocks(): void {
 try { commandsApi.__clearRegistry(); } catch { /* ignore */ }
 try { windowApi.__clearWindowState(); } catch { /* ignore */ }
 try { workspaceApi.__clearWorkspaceState(); } catch { /* ignore */ }
 try { viewsApi.__clearViews(); } catch { /* ignore */ }
 try { menusApi.__clearMenus(); } catch { /* ignore */ }
 try { languagesApi.__clearLanguages(); } catch { /* ignore */ }
 try { themingApi.__clearTheming(); } catch { /* ignore */ }
 try { debugApi.__clearDebug(); } catch { /* ignore */ }
 try { tasksApi.__clearTasks(); } catch { /* ignore */ }
 try { scmApi.__clearScm(); } catch { /* ignore */ }
 try { snippetsApi.__clearSnippets(); } catch { /* ignore */ }
 try { authenticationApi.__clearAuthentication(); } catch { /* ignore */ }
 try { terminalApi.__clearTerminal(); } catch { /* ignore */ }
 try { extensionsApi.__clearExtensions(); } catch { /* ignore */ }
 // also clear delegates so mock starts clean (host injection not leaked between tests)
 try { commandsApi.setCommandDelegate(null); } catch { /* ignore */ }
 try { windowApi.setWindowDelegate(null); } catch { /* ignore */ }
 try { workspaceApi.setWorkspaceDelegate(null); } catch { /* ignore */ }
 try { viewsApi.setViewsDelegate(null); } catch { /* ignore */ }
 try { menusApi.setMenusDelegate(null); } catch { /* ignore */ }
 try { languagesApi.setLanguagesDelegate(null); } catch { /* ignore */ }
 try { themingApi.setThemingDelegate(null); } catch { /* ignore */ }
 try { debugApi.setDebugDelegate(null); } catch { /* ignore */ }
 try { tasksApi.setTasksDelegate(null); } catch { /* ignore */ }
 try { scmApi.setScmDelegate(null); } catch { /* ignore */ }
 try { snippetsApi.setSnippetsDelegate(null); } catch { /* ignore */ }
 try { authenticationApi.setAuthenticationDelegate(null); } catch { /* ignore */ }
 try { terminalApi.setTerminalDelegate(null); } catch { /* ignore */ }
 try { extensionsApi.setExtensionsDelegate(null); } catch { /* ignore */ }
}

// createMockContext — fresh ExtensionContext with in-memory Memento

export interface MockContextOptions {
 id?: string;
 extensionPath?: string;
 initialGlobalState?: Record<string, unknown>;
 initialWorkspaceState?: Record<string, unknown>;
}

export function createMockContext(options: string | MockContextOptions = 'mock.extension'): ExtensionContext {
 if (typeof options === 'string') {
 return new ExtensionContext(options);
 }
 const id = options.id ?? 'mock.extension';
 const globalState = new InMemoryMemento(options.initialGlobalState ?? {});
 const workspaceState = new InMemoryMemento(options.initialWorkspaceState ?? {});
 const secrets = new InMemorySecretStorage();
 const ctxOptions: ExtensionContextOptions = {
 id,
 extensionPath: options.extensionPath ?? `/extensions/${id}`,
 globalState,
 workspaceState,
 secrets,
 };
 return new ExtensionContext(ctxOptions);
}

// createMockNotron — aggregated mock for all 14 namespaces

export interface MockNotronOptions {
 /** If true (default), clears all registries before returning mock. */
 reset?: boolean;
 /** Optional extensionId prefix for command registration (for isolation). */
 extensionId?: string;
}

export interface MockNotron {
 commands: typeof commandsApi.commands & {
 __getRegisteredIds: typeof commandsApi.__getRegisteredIds;
 __getRegisteredCommands: typeof commandsApi.__getRegisteredIds;
 __clearRegistry: typeof commandsApi.__clearRegistry;
 __isKnownCoreCommand: typeof commandsApi.__isKnownCoreCommand;
 setDelegate: typeof commandsApi.setCommandDelegate;
 };
 window: typeof windowApi.window & {
 __getShownMessages: typeof windowApi.__getShownMessages;
 __clearShownMessages: typeof windowApi.__clearShownMessages;
 __getStatusBarItems: typeof windowApi.__getStatusBarItems;
 __getOutputChannels: typeof windowApi.__getOutputChannels;
 __getOutputChannelText: typeof windowApi.__getOutputChannelText;
 __clearWindowState: typeof windowApi.__clearWindowState;
 __setActiveTab: typeof windowApi.__setActiveTab;
 __setActiveTextEditor: typeof windowApi.__setActiveTextEditor;
 __setVisibleTextEditors: typeof windowApi.__setVisibleTextEditors;
 __getCustomEditorProviders: typeof windowApi.__getCustomEditorProviders;
 __getWebviewViewProviders: typeof windowApi.__getWebviewViewProviders;
 setDelegate: typeof windowApi.setWindowDelegate;
 };
 workspace: typeof workspaceApi.workspace & {
 fs: typeof workspaceApi.fs;
 __clearWorkspaceState: typeof workspaceApi.__clearWorkspaceState;
 __getConfigStore: typeof workspaceApi.__getConfigStore;
 __getFsEntries: typeof workspaceApi.__getFsEntries;
 __setWorkspaceFolders: typeof workspaceApi.__setWorkspaceFolders;
 __fireDidOpen: typeof workspaceApi.__fireDidOpen;
 __fireDidClose: typeof workspaceApi.__fireDidClose;
 __fireDidSave: typeof workspaceApi.__fireDidSave;
 __fireDidChange: typeof workspaceApi.__fireDidChange;
 __getFileSystemProviders: typeof workspaceApi.__getFileSystemProviders;
 setDelegate: typeof workspaceApi.setWorkspaceDelegate;
 };
 views: typeof viewsApi.views & {
 __getViewContainers: typeof viewsApi.__getViewContainers;
 __getViews: typeof viewsApi.__getViews;
 __getTreeDataProviders: typeof viewsApi.__getTreeDataProviders;
 __getWebviewViewProviders: typeof viewsApi.__getWebviewViewProviders;
 __clearViews: typeof viewsApi.__clearViews;
 __registerViewContainer: typeof viewsApi.__registerViewContainer;
 __registerView: typeof viewsApi.__registerView;
 setDelegate: typeof viewsApi.setViewsDelegate;
 };
 menus: typeof menusApi.menus & {
 evaluateWhenClause: typeof menusApi.evaluateWhenClause;
 getMenus: typeof menusApi.getMenus;
 __getMenuContributions: typeof menusApi.__getMenuContributions;
 __clearMenus: typeof menusApi.__clearMenus;
 __registerMenu: typeof menusApi.__registerMenu;
 setDelegate: typeof menusApi.setMenusDelegate;
 };
 languages: typeof languagesApi.languages & {
 __getCompletionProviders: typeof languagesApi.__getCompletionProviders;
 __getHoverProviders: typeof languagesApi.__getHoverProviders;
 __getDefinitionProviders: typeof languagesApi.__getDefinitionProviders;
 __getFormattingProviders: typeof languagesApi.__getFormattingProviders;
 __getDeclaredLanguages: typeof languagesApi.__getDeclaredLanguages;
 __getDeclaredGrammars: typeof languagesApi.__getDeclaredGrammars;
 __getDiagnosticCollections: typeof languagesApi.__getDiagnosticCollections;
 __getLanguageConfigurations: typeof languagesApi.__getLanguageConfigurations;
 __clearLanguages: typeof languagesApi.__clearLanguages;
 __registerLanguage: typeof languagesApi.__registerLanguage;
 __registerGrammar: typeof languagesApi.__registerGrammar;
 setDelegate: typeof languagesApi.setLanguagesDelegate;
 };
 theming: typeof themingApi.theming & {
 __getContributedThemes: typeof themingApi.__getContributedThemes;
 __getContributedIconThemes: typeof themingApi.__getContributedIconThemes;
 __clearTheming: typeof themingApi.__clearTheming;
 __setActiveTheme: typeof themingApi.__setActiveTheme;
 __getActiveThemeFallback: typeof themingApi.__getActiveThemeFallback;
 __registerTheme: typeof themingApi.__registerTheme;
 setDelegate: typeof themingApi.setThemingDelegate;
 };
 debug: typeof debugApi.debug & {
 __getDeclaredDebuggers: typeof debugApi.__getDeclaredDebuggers;
 __getAdapterFactories: typeof debugApi.__getAdapterFactories;
 __clearDebug: typeof debugApi.__clearDebug;
 __registerDebugger: typeof debugApi.__registerDebugger;
 __fireDidStartDebugSession: typeof debugApi.__fireDidStartDebugSession;
 __fireDidTerminateDebugSession: typeof debugApi.__fireDidTerminateDebugSession;
 setDelegate: typeof debugApi.setDebugDelegate;
 };
 tasks: typeof tasksApi.tasks & {
 __getTaskProviders: typeof tasksApi.__getTaskProviders;
 __getDeclaredTaskDefinitions: typeof tasksApi.__getDeclaredTaskDefinitions;
 __getActiveExecutions: typeof tasksApi.__getActiveExecutions;
 __clearTasks: typeof tasksApi.__clearTasks;
 __registerTaskDefinition: typeof tasksApi.__registerTaskDefinition;
 __fireDidStartTask: typeof tasksApi.__fireDidStartTask;
 __fireDidEndTask: typeof tasksApi.__fireDidEndTask;
 setDelegate: typeof tasksApi.setTasksDelegate;
 };
 scm: typeof scmApi.scm & {
 __getSourceControls: typeof scmApi.__getSourceControls;
 __clearScm: typeof scmApi.__clearScm;
 setDelegate: typeof scmApi.setScmDelegate;
 };
 snippets: typeof snippetsApi.snippets & {
 __getLanguageSnippetMap: typeof snippetsApi.__getLanguageSnippetMap;
 __clearSnippets: typeof snippetsApi.__clearSnippets;
 __registerSnippetContribution: typeof snippetsApi.__registerSnippetContribution;
 setDelegate: typeof snippetsApi.setSnippetsDelegate;
 };
 authentication: typeof authenticationApi.authentication & {
 __getAuthenticationProviders: typeof authenticationApi.__getAuthenticationProviders;
 __clearAuthentication: typeof authenticationApi.__clearAuthentication;
 __fireDidChangeSessions: typeof authenticationApi.__fireDidChangeSessions;
 setDelegate: typeof authenticationApi.setAuthenticationDelegate;
 };
 terminal: typeof terminalApi.terminal & {
 __getTerminals: typeof terminalApi.__getTerminals;
 __getProfileProviders: typeof terminalApi.__getProfileProviders;
 __getLinkProviders: typeof terminalApi.__getLinkProviders;
 __clearTerminal: typeof terminalApi.__clearTerminal;
 setDelegate: typeof terminalApi.setTerminalDelegate;
 };
 extensions: typeof extensionsApi.extensions & {
 __clearExtensions: typeof extensionsApi.__clearExtensions;
 __registerExtensionInfo: typeof extensionsApi.__registerExtensionInfo;
 setDelegate: typeof extensionsApi.setExtensionsDelegate;
 };
 /** Reset all in-memory registries (same as resetAllMocks()). */
 __resetAll: typeof resetAllMocks;
 /** Convenience: dispose alias for __resetAll. */
 dispose: typeof resetAllMocks;
}

export function createMockNotron(options: MockNotronOptions = {}): MockNotron {
 const doReset = options.reset !== false;
 if (doReset) resetAllMocks();

 const commands = withHelpers(commandsApi.commands as unknown as object, {
 __getRegisteredIds: commandsApi.__getRegisteredIds,
 __getRegisteredCommands: commandsApi.__getRegisteredIds,
 __clearRegistry: commandsApi.__clearRegistry,
 __isKnownCoreCommand: commandsApi.__isKnownCoreCommand,
 setDelegate: commandsApi.setCommandDelegate,
 getDelegate: commandsApi.getCommandDelegate,
 }) as MockNotron['commands'];

 const windowNs = withHelpers(windowApi.window as unknown as object, {
 __getShownMessages: windowApi.__getShownMessages,
 __clearShownMessages: windowApi.__clearShownMessages,
 __getStatusBarItems: windowApi.__getStatusBarItems,
 __getOutputChannels: windowApi.__getOutputChannels,
 __getOutputChannelText: windowApi.__getOutputChannelText,
 __clearWindowState: windowApi.__clearWindowState,
 __setActiveTab: windowApi.__setActiveTab,
 __setTabGroups: windowApi.__setTabGroups,
 __setActiveTextEditor: windowApi.__setActiveTextEditor,
 __setVisibleTextEditors: windowApi.__setVisibleTextEditors,
 __getCustomEditorProviders: windowApi.__getCustomEditorProviders,
 __getWebviewViewProviders: windowApi.__getWebviewViewProviders,
 setDelegate: windowApi.setWindowDelegate,
 getDelegate: windowApi.getWindowDelegate,
 // expose tabGroups getter properly via proxy delegation (windowApi.window.tabGroups)
 }) as MockNotron['window'];

 const workspaceNs = withHelpers(workspaceApi.workspace as unknown as object, {
 fs: workspaceApi.fs,
 __clearWorkspaceState: workspaceApi.__clearWorkspaceState,
 __getConfigStore: workspaceApi.__getConfigStore,
 __getFsEntries: workspaceApi.__getFsEntries,
 __setWorkspaceFolders: workspaceApi.__setWorkspaceFolders,
 __fireDidOpen: workspaceApi.__fireDidOpen,
 __fireDidClose: workspaceApi.__fireDidClose,
 __fireDidSave: workspaceApi.__fireDidSave,
 __fireDidChange: workspaceApi.__fireDidChange,
 __getFileSystemProviders: workspaceApi.__getFileSystemProviders,
 setDelegate: workspaceApi.setWorkspaceDelegate,
 getDelegate: workspaceApi.getWorkspaceDelegate,
 }) as MockNotron['workspace'];

 const views = withHelpers(viewsApi.views as unknown as object, {
 __getViewContainers: viewsApi.__getViewContainers,
 __getViews: viewsApi.__getViews,
 __getTreeDataProviders: viewsApi.__getTreeDataProviders,
 __getWebviewViewProviders: viewsApi.__getWebviewViewProviders,
 __clearViews: viewsApi.__clearViews,
 __registerViewContainer: viewsApi.__registerViewContainer,
 __registerView: viewsApi.__registerView,
 setDelegate: viewsApi.setViewsDelegate,
 getDelegate: viewsApi.getViewsDelegate,
 }) as MockNotron['views'];

 const menus = withHelpers(menusApi.menus as unknown as object, {
 evaluateWhenClause: menusApi.evaluateWhenClause,
 getMenus: menusApi.getMenus,
 __getMenuContributions: menusApi.__getMenuContributions,
 __clearMenus: menusApi.__clearMenus,
 __registerMenu: menusApi.__registerMenu,
 setDelegate: menusApi.setMenusDelegate,
 }) as MockNotron['menus'];

 const languages = withHelpers(languagesApi.languages as unknown as object, {
 __getCompletionProviders: languagesApi.__getCompletionProviders,
 __getHoverProviders: languagesApi.__getHoverProviders,
 __getDefinitionProviders: languagesApi.__getDefinitionProviders,
 __getFormattingProviders: languagesApi.__getFormattingProviders,
 __getDeclaredLanguages: languagesApi.__getDeclaredLanguages,
 __getDeclaredGrammars: languagesApi.__getDeclaredGrammars,
 __getDiagnosticCollections: languagesApi.__getDiagnosticCollections,
 __getLanguageConfigurations: languagesApi.__getLanguageConfigurations,
 __clearLanguages: languagesApi.__clearLanguages,
 __registerLanguage: languagesApi.__registerLanguage,
 __registerGrammar: languagesApi.__registerGrammar,
 setDelegate: languagesApi.setLanguagesDelegate,
 getDelegate: languagesApi.getLanguagesDelegate,
 }) as MockNotron['languages'];

 const theming = withHelpers(themingApi.theming as unknown as object, {
 __getContributedThemes: themingApi.__getContributedThemes,
 __getContributedIconThemes: themingApi.__getContributedIconThemes,
 __getContributedProductIconThemes: themingApi.__getContributedProductIconThemes,
 __clearTheming: themingApi.__clearTheming,
 __setActiveTheme: themingApi.__setActiveTheme,
 __getActiveThemeFallback: themingApi.__getActiveThemeFallback,
 __registerTheme: themingApi.__registerTheme,
 __registerIconTheme: themingApi.__registerIconTheme,
 __registerProductIconTheme: themingApi.__registerProductIconTheme,
 setDelegate: themingApi.setThemingDelegate,
 getDelegate: themingApi.getThemingDelegate,
 }) as MockNotron['theming'];

 const debug = withHelpers(debugApi.debug as unknown as object, {
 __getDeclaredDebuggers: debugApi.__getDeclaredDebuggers,
 __getAdapterFactories: debugApi.__getAdapterFactories,
 __clearDebug: debugApi.__clearDebug,
 __registerDebugger: debugApi.__registerDebugger,
 __fireDidStartDebugSession: debugApi.__fireDidStartDebugSession,
 __fireDidTerminateDebugSession: debugApi.__fireDidTerminateDebugSession,
 setDelegate: debugApi.setDebugDelegate,
 getDelegate: debugApi.getDebugDelegate,
 }) as MockNotron['debug'];

 const tasks = withHelpers(tasksApi.tasks as unknown as object, {
 __getTaskProviders: tasksApi.__getTaskProviders,
 __getDeclaredTaskDefinitions: tasksApi.__getDeclaredTaskDefinitions,
 __getActiveExecutions: tasksApi.__getActiveExecutions,
 __clearTasks: tasksApi.__clearTasks,
 __registerTaskDefinition: tasksApi.__registerTaskDefinition,
 __fireDidStartTask: tasksApi.__fireDidStartTask,
 __fireDidEndTask: tasksApi.__fireDidEndTask,
 setDelegate: tasksApi.setTasksDelegate,
 getDelegate: tasksApi.getTasksDelegate,
 }) as MockNotron['tasks'];

 const scm = withHelpers(scmApi.scm as unknown as object, {
 __getSourceControls: scmApi.__getSourceControls,
 __clearScm: scmApi.__clearScm,
 setDelegate: scmApi.setScmDelegate,
 getDelegate: scmApi.getScmDelegate,
 }) as MockNotron['scm'];

 const snippets = withHelpers(snippetsApi.snippets as unknown as object, {
 __getLanguageSnippetMap: snippetsApi.__getLanguageSnippetMap,
 __clearSnippets: snippetsApi.__clearSnippets,
 __registerSnippetContribution: snippetsApi.__registerSnippetContribution,
 setDelegate: snippetsApi.setSnippetsDelegate,
 getDelegate: snippetsApi.getSnippetsDelegate,
 }) as MockNotron['snippets'];

 const authentication = withHelpers(authenticationApi.authentication as unknown as object, {
 __getAuthenticationProviders: authenticationApi.__getAuthenticationProviders,
 __clearAuthentication: authenticationApi.__clearAuthentication,
 __fireDidChangeSessions: authenticationApi.__fireDidChangeSessions,
 setDelegate: authenticationApi.setAuthenticationDelegate,
 getDelegate: authenticationApi.getAuthenticationDelegate,
 }) as MockNotron['authentication'];

 const terminal = withHelpers(terminalApi.terminal as unknown as object, {
 __getTerminals: terminalApi.__getTerminals,
 __getProfileProviders: terminalApi.__getProfileProviders,
 __getLinkProviders: terminalApi.__getLinkProviders,
 __clearTerminal: terminalApi.__clearTerminal,
 setDelegate: terminalApi.setTerminalDelegate,
 getDelegate: terminalApi.getTerminalDelegate,
 }) as MockNotron['terminal'];

 const extensions = withHelpers(extensionsApi.extensions as unknown as object, {
 __clearExtensions: extensionsApi.__clearExtensions,
 __registerExtensionInfo: extensionsApi.__registerExtensionInfo,
 setDelegate: extensionsApi.setExtensionsDelegate,
 getDelegate: extensionsApi.getExtensionsDelegate,
 }) as MockNotron['extensions'];

 return {
 commands,
 window: windowNs,
 workspace: workspaceNs,
 views,
 menus,
 languages,
 theming,
 debug,
 tasks,
 scm,
 snippets,
 authentication,
 terminal,
 extensions,
 __resetAll: resetAllMocks,
 dispose: resetAllMocks,
 };
}

// Re-export individual helpers for convenience when importing `notron-sdk/testing` directly.
export { resetAllMocks as __resetAllMocks };
