/**
 * Notron SDK
 *
 * Public entry for the Notron SDK.
 */
export * from './types/index.js';
export * from './host/index.js';
export * from './utils/index.js';

// Re-export api surface without colliding manifest contribution names.
// Manifest contribution types are canonical in './types/index.js'.
export type {
 Extension,
 ExtensionContributions,
 MenuContribution,
} from './api/extensions.js';
export { type CommandContribution as ApiCommandContribution } from './api/extensions.js';
export { type KeybindingContribution as ApiKeybindingContribution } from './api/extensions.js';
export * from './api/events.js';
export * from './api/activity.js';

// Namespaced API (primary import style: `import { commands, window, workspace } from 'notron-sdk'`)
export * as commandsModule from './api/commands.js';
export * as windowModule from './api/window.js';
export * as workspaceModule from './api/workspace.js';
export * as viewsModule from './api/views.js';
export * as menusModule from './api/menus.js';
export * as languagesModule from './api/languages.js';
export * as themingModule from './api/theming.js';
export * as debugModule from './api/debug.js';
export * as tasksModule from './api/tasks.js';
export * as scmModule from './api/scm.js';
export * as snippetsModule from './api/snippets.js';
export * as authenticationModule from './api/authentication.js';
export * as terminalModule from './api/terminal.js';
export * as extensionsModule from './api/extensions.js';
export * as discordModule from './api/discord.js';
export * as activityModule from './api/activity.js';
export { commands } from './api/commands.js';
export { window, windowNamespace } from './api/window.js';
export { workspace, workspaceNamespace, fs as workspaceFs } from './api/workspace.js';
export { views, viewsNamespace } from './api/views.js';
export { menus, menusNamespace, evaluateWhenClause } from './api/menus.js';
export { languages, languagesNamespace } from './api/languages.js';
export { theming, themingNamespace } from './api/theming.js';
export { debug, debugNamespace } from './api/debug.js';
export { tasks, tasksNamespace } from './api/tasks.js';
export { scm, scmNamespace } from './api/scm.js';
export { snippets, snippetsNamespace } from './api/snippets.js';
export { authentication, authenticationNamespace } from './api/authentication.js';
export { terminal, terminalNamespace } from './api/terminal.js';
export { extensions, extensionsNamespace } from './api/extensions.js';
export { setExtensionsDelegate, getExtensionsDelegate } from './api/extensions.js';
export { discord, discordNamespace } from './api/discord.js';
export { activity } from './api/activity.js';
export {
  __registerTheme,
  __registerIconTheme,
  __registerProductIconTheme,
  __getContributedThemes,
  __getContributedIconThemes,
  __getContributedProductIconThemes,
  __getIconThemeProvider,
  __clearTheming,
  __setActiveTheme,
  __getActiveThemeFallback,
  setThemingDelegate,
  getThemingDelegate,
} from './api/theming.js';
export { setWorkspaceDelegate, getWorkspaceDelegate, __setWorkspaceFolders as __setSdkWorkspaceFolders } from './api/workspace.js';
export {
setConfigurationContributionDelegate,
__registerConfigurationContribution,
registerConfiguration,
} from './api/workspace.js';
export { setWindowDelegate, getWindowDelegate } from './api/window.js';
export { setViewsDelegate, __getTreeDataProviders } from './api/views.js';
export { setMenusDelegate } from './api/menus.js';
export { setDiscordDelegate, getDiscordDelegate, initDiscordPresence, setDiscordActivity, clearDiscordPresence } from './api/discord.js';
export { setActivityDelegate, getActivityDelegate, initActivity, setActivity, clearActivity } from './api/activity.js';
export { __setCommandMirror } from './api/commands.js';
export { __setActiveTextEditor, __setVisibleTextEditors, __setActiveTab } from './api/window.js';
export { __setWorkspaceFolders } from './api/workspace.js';
export {
  __getRegisteredIds as __getCommandIds,
  __clearRegistry as __clearCommands,
  setCommandDelegate,
  setCommandContributionDelegate,
  __registerCommandContribution,
} from './api/commands.js';
export * from './api/types.js';
