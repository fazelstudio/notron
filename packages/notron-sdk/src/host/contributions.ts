/**
 * Contributions
 *
 * Reads manifest contributions and registers them in memory.
 */
import type { ExtensionManifest } from '../types/index.js';
import type { Disposable } from '../api/types.js';
import { combinedDisposable } from '../api/types.js';
import { __registerViewContainer, __registerView } from '../api/views.js';
import { __registerMenu } from '../api/menus.js';
import { __registerLanguage, __registerGrammar } from '../api/languages.js';
import { __registerTheme, __registerIconTheme, __registerProductIconTheme } from '../api/theming.js';
import type { MenuLocation } from '../api/menus.js';
import { __registerSnippetContribution } from '../api/snippets.js';
import { __registerDebugger } from '../api/debug.js';
import { __registerTaskDefinition } from '../api/tasks.js';

export function registerManifestContributions(manifest: ExtensionManifest, extensionId: string): Disposable {
 const disposables: Disposable[] = [];
 const contributes = manifest.contributes as unknown as Record<string, unknown> | undefined;
 if (!contributes) return { dispose() {} };

 const viewsContainers = contributes.viewsContainers as
 | { activitybar?: Array<{ id: string; title: string; icon: string }>; panel?: Array<{ id: string; title: string; icon: string }> }
 | undefined;
 if (viewsContainers) {
 for (const vc of viewsContainers.activitybar ?? []) {
 try {
 disposables.push(__registerViewContainer({ id: vc.id, title: vc.title, icon: vc.icon }));
 } catch (err) {
 console.warn(`[contributions] viewsContainers.activitybar "${vc.id}" failed:`, err);
 }
 }
 for (const vc of viewsContainers.panel ?? []) {
 try {
 // panel containers are also ViewContainers; distinguish by prefix if needed
 disposables.push(__registerViewContainer({ id: vc.id, title: vc.title, icon: vc.icon }));
 } catch (err) {
 console.warn(`[contributions] viewsContainers.panel "${vc.id}" failed:`, err);
 }
 }
 }

 const views = contributes.views as Record<string, Array<{ id: string; name: string; type?: string; when?: string; icon?: string }>> | undefined;
 if (views) {
 for (const [containerId, list] of Object.entries(views)) {
 for (const v of list as Array<{ id: string; name: string; type?: string; when?: string; icon?: string }>) {
 try {
 disposables.push(
 __registerView({
 id: v.id,
 name: v.name,
 containerId,
 type: (v.type as 'tree' | 'webview' | undefined) ?? 'tree',
 when: v.when,
 icon: v.icon,
 }),
 );
 } catch (err) {
 console.warn(`[contributions] views "${v.id}" failed:`, err);
 }
 }
 }
 }

 const menus = contributes.menus as Partial<Record<string, Array<{ command: string; when?: string; group?: string; alt?: string }>>> | undefined;
 if (menus) {
 for (const [loc, items] of Object.entries(menus as Record<string, unknown>)) {
 const entries = items as Array<{ command: string; when?: string; group?: string; alt?: string }>;
 for (const item of entries) {
 try {
 disposables.push(
 __registerMenu(loc as MenuLocation, {
 command: item.command,
 when: item.when,
 group: item.group,
 alt: item.alt,
 extensionId,
 }),
 );
 } catch (err) {
 console.warn(`[contributions] menus "${loc}" -> "${item.command}" failed:`, err);
 }
 }
 }
 }

 const languages = contributes.languages as Array<{ id: string; extensions: string[]; aliases?: string[]; configuration?: string }> | undefined;
 if (languages) {
 for (const lang of languages) {
 try {
 disposables.push(__registerLanguage({ id: lang.id, extensions: lang.extensions, aliases: lang.aliases, configuration: lang.configuration }));
 } catch (err) {
 console.warn(`[contributions] languages "${lang.id}" failed:`, err);
 }
 }
 }

 const grammars = contributes.grammars as Array<{ language: string; scopeName: string; path: string }> | undefined;
 if (grammars) {
 for (const g of grammars) {
 try {
 disposables.push(__registerGrammar({ language: g.language, scopeName: g.scopeName, path: g.path }));
 } catch (err) {
 console.warn(`[contributions] grammars "${g.language}" failed:`, err);
 }
 }
 }

 const themes = contributes.themes as Array<{ id: string; label: string; uiTheme: 'light' | 'dark'; path: string; isHighContrast?: boolean }> | undefined;
 if (themes) {
 for (const t of themes) {
 try {
 disposables.push( __registerTheme({ id: t.id, label: t.label, uiTheme: t.uiTheme, path: t.path, extensionId, isHighContrast: t.isHighContrast }));
 } catch (err) {
 console.warn(`[contributions] themes "${t.id}" failed:`, err);
 }
 }
 }

 const iconThemes = (contributes as Record<string, unknown>).iconThemes as Array<{ id: string; label: string; path: string }> | undefined;
 if (iconThemes) {
 for (const it of iconThemes) {
 try {
 disposables.push(__registerIconTheme({ id: it.id, label: it.label, path: it.path, extensionId }));
 } catch (err) {
 console.warn(`[contributions] iconThemes "${it.id}" failed:`, err);
 }
 }
 }

 const productIconThemes = (contributes as Record<string, unknown>).productIconThemes as Array<{ id: string; label: string; path: string }> | undefined;
 if (productIconThemes) {
 for (const pit of productIconThemes) {
 try {
 disposables.push(__registerProductIconTheme({ id: pit.id, label: pit.label, path: pit.path, extensionId }));
 } catch (err) {
 console.warn(`[contributions] productIconThemes "${pit.id}" failed:`, err);
 }
 }
 }

 const snippets = contributes.snippets as Array<{ language: string; path: string }> | undefined;
 if (snippets) {
 for (const s of snippets) {
 try {
 disposables.push(__registerSnippetContribution({ language: s.language, path: s.path, extensionId }));
 } catch (err) {
 console.warn(`[contributions] snippets "${s.language}" failed:`, err);
 }
 }
 }

 // Debuggers are data-only and kept for host inspection.
 const debuggers = contributes.debuggers as Array<{ type: string; label: string; program?: string }> | undefined;
 if (debuggers) {
 for (const d of debuggers) {
 try {
 disposables.push(__registerDebugger({ type: d.type, label: d.label, program: d.program, extensionId }));
 } catch (err) {
 console.warn(`[contributions] debuggers "${d.type}" failed:`, err);
 }
 }
 }

 // Task definitions are data-only and partially bridged to the registry.
 const taskDefinitions = contributes.taskDefinitions as Array<{ type: string; properties?: Record<string, unknown> }> | undefined;
 if (taskDefinitions) {
 for (const td of taskDefinitions) {
 try {
 disposables.push(__registerTaskDefinition({ type: td.type, properties: td.properties as Record<string, unknown> | undefined, extensionId }));
 } catch (err) {
 console.warn(`[contributions] taskDefinitions "${td.type}" failed:`, err);
 }
 }
 }

 // Configuration is already validated and needs no runtime registry.
 // Host can read manifest.contributes.configuration via validateManifest.

 return combinedDisposable(...disposables);
}
