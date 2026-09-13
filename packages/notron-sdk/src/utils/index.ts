/**
 * Utilities
 *
 * Helpers for manifest validation and checksums.
 */
import type { ValidationResult } from '../types/index.js';

// Existing helpers (preserved)

export function joinUri(base: string, ...parts: string[]): string {
 const joined = [base, ...parts].join('/').replace(/\/+/g, '/');
 return joined.replace(/\/$/, '');
}

export function isString(value: unknown): value is string {
 return typeof value === 'string';
}

// Constants

const ALLOWED_PERMISSIONS = [
 'fs:workspace-read',
 'fs:workspace-write',
 'fs:outside-workspace',
 'shell:execute',
 'network:fetch',
 'clipboard:read',
 'clipboard:write',
] as const;

const ALLOWED_MENU_LOCATIONS = [
 'commandPalette',
 'editor/context',
 'editor/title',
 'explorer/context',
 'view/title',
 'view/item/context',
 'tab/context',
 'menubar/file',
 'menubar/edit',
 'menubar/view',
 'menubar/run',
 'menubar/help',
 'pane/context',
] as const;

// Regexes
const ID_REGEX = /^[a-z0-9][a-z0-9_-]*\.[a-z0-9][a-z0-9_-]*$/i;
const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SEMVER_RANGE_LOOSE = /^[\^~><=\s]*\d+\.\d+\.\d+.*$/;

// Activation prefixes
const ACTIVATION_PREFIXES = [
 'onCommand:',
 'onLanguage:',
 'onView:',
 'workspaceContains:',
 'onCustomEditor:',
] as const;
const ACTIVATION_EXACT = ['onUri', 'onStartupFinished', '*'] as const;

// Internal helpers

function isRecord(value: unknown): value is Record<string, unknown> {
 return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): boolean {
 return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
 return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isValidSemver(value: string): boolean {
 return SEMVER_REGEX.test(value.trim());
}

function isValidSemverRange(value: string): boolean {
 const trimmed = value.trim();
 if (trimmed === '' || trimmed === '*') return trimmed === '*';
 // allow multiple comparators separated by space or ||
 // e.g. "^0.3.0", ">=0.3.0 <1.0.0", "0.3.x" (x not strictly semver)
 // For leniency, check loose range or semver itself
 if (isValidSemver(trimmed)) return true;
 // Replace x / * wildcards after checking loose form
 if (/^\d+\.\d+\.(x|\*)$/i.test(trimmed)) return true;
 if (/^\d+\.(x|\*)$/i.test(trimmed)) return true;
 return SEMVER_RANGE_LOOSE.test(trimmed);
}

function makeResult(errors: string[]): ValidationResult {
 return { valid: errors.length === 0, errors };
}

// Activation event validation

export function isValidActivationEvent(value: string): boolean {
 if ((ACTIVATION_EXACT as readonly string[]).includes(value)) return true;
 for (const prefix of ACTIVATION_PREFIXES) {
 if (value.startsWith(prefix)) {
 const suffix = value.slice(prefix.length);
 // suffix must be non-empty after trimming; allow glob chars, dots, etc., but not empty/whitespace-only
 return suffix.trim().length > 0;
 }
 }
 return false;
}

export function validateActivationEvents(input: unknown): ValidationResult {
 const errors: string[] = [];

 let events: unknown = input;
 if (Array.isArray(input)) {
 events = input;
 } else if (isRecord(input) && 'activationEvents' in input) {
 events = (input as Record<string, unknown>).activationEvents;
 }

 if (!Array.isArray(events)) {
 return makeResult(['activationEvents: must be an array']);
 }

 if (events.length === 0) {
 errors.push('activationEvents: must contain at least one event');
 }

 const seen = new Set<string>();
 for (let i = 0; i < events.length; i++) {
 const ev = events[i];
 if (typeof ev !== 'string') {
 errors.push(`activationEvents[${i}]: must be a string`);
 continue;
 }
 if (!isValidActivationEvent(ev)) {
 errors.push(
 `activationEvents[${i}]: invalid activation event "${ev}" — expected one of onCommand:<id>, onLanguage:<id>, onView:<id>, onUri, onStartupFinished, workspaceContains:<glob>, onCustomEditor:<id>, *`,
 );
 continue;
 }
 if (seen.has(ev)) {
 errors.push(`activationEvents[${i}]: duplicate event "${ev}"`);
 } else {
 seen.add(ev);
 }
 }

 return makeResult(errors);
}

// Permission validation

export function validatePermissions(input: unknown): ValidationResult {
 const errors: string[] = [];

 let perms: unknown = input;
 if (Array.isArray(input)) {
 perms = input;
 } else if (isRecord(input) && 'permissions' in input) {
 perms = (input as Record<string, unknown>).permissions;
 // If permissions is undefined, treat as empty (optional field)
 if (perms === undefined) return makeResult([]);
 } else if (isRecord(input)) {
 // If input is a record without permissions key but not an array, we can't tell
 // Fall through to array check which will emit "must be an array"
 perms = input;
 }

 // If the caller passed undefined (optional permissions), it's valid
 if (perms === undefined) return makeResult([]);

 if (!Array.isArray(perms)) {
 return makeResult(['permissions: must be an array']);
 }

 const allowed = new Set<string>(ALLOWED_PERMISSIONS as unknown as string[]);
 const seen = new Set<string>();
 for (let i = 0; i < perms.length; i++) {
 const p = perms[i];
 if (typeof p !== 'string') {
 errors.push(`permissions[${i}]: must be a string`);
 continue;
 }
 if (!allowed.has(p)) {
 errors.push(
 `permissions[${i}]: invalid permission "${p}" — allowed: ${ALLOWED_PERMISSIONS.join(', ')}`,
 );
 continue;
 }
 if (seen.has(p)) {
 errors.push(`permissions[${i}]: duplicate permission "${p}"`);
 } else {
 seen.add(p);
 }
 }

 return makeResult(errors);
}

// Manifest validation

export function validateManifest(input: unknown): ValidationResult {
 const errors: string[] = [];

 if (!isRecord(input)) {
 return makeResult(['manifest: must be an object']);
 }

 const m = input as Record<string, unknown>;

 if (!isNonEmptyString(m.id)) {
 errors.push('id: required, non-empty string in format publisher.name');
 } else if (!ID_REGEX.test(m.id as string)) {
 errors.push('id: must match publisher.name (e.g. "my-pub.my-extension"), allowed chars: a-z, 0-9, -, _ with exactly one dot');
 }

 if (!isNonEmptyString(m.name)) {
 errors.push('name: required, non-empty string');
 }

 for (const key of ['displayName', 'description', 'icon', 'license', 'repository'] as const) {
 if (m[key] !== undefined && typeof m[key] !== 'string') {
 errors.push(`${key}: must be a string if provided`);
 } else if (typeof m[key] === 'string' && (m[key] as string).length === 0) {
 errors.push(`${key}: must be non-empty string if provided`);
 }
 }

 if (!isNonEmptyString(m.version)) {
 errors.push('version: required, non-empty string (semver)');
 } else if (!isValidSemver(m.version as string)) {
 errors.push('version: must be valid semver (e.g. "1.0.0", "0.3.0-alpha.1")');
 }

 if (!isNonEmptyString(m.publisher)) {
 errors.push('publisher: required, non-empty string');
 } else if (!/^[a-z0-9][a-z0-9_-]*$/i.test(m.publisher as string)) {
 errors.push('publisher: must match /^[a-z0-9][a-z0-9_-]*$/i');
 }

 // cross-check id prefix vs publisher
 if (isNonEmptyString(m.id) && isNonEmptyString(m.publisher) && ID_REGEX.test(m.id as string)) {
 const prefix = (m.id as string).split('.')[0];
 if (prefix !== m.publisher) {
 errors.push('id: publisher prefix must match publisher field');
 }
 }

 for (const key of ['keywords', 'categories'] as const) {
 if (m[key] !== undefined) {
 if (!Array.isArray(m[key])) {
 errors.push(`${key}: must be an array of strings if provided`);
 } else {
 for (let i = 0; i < (m[key] as unknown[]).length; i++) {
 const v = (m[key] as unknown[])[i];
 if (typeof v !== 'string' || v.trim().length === 0) {
 errors.push(`${key}[${i}]: must be non-empty string`);
 }
 }
 }
 }
 }

 if (!isRecord(m.engines)) {
 errors.push('engines: required object with field notron');
 } else {
 const eng = m.engines as Record<string, unknown>;
 if (!isNonEmptyString(eng.notron)) {
 errors.push('engines.notron: required, non-empty string (semver range, e.g. "^0.3.0")');
 } else if (!isValidSemverRange(eng.notron as string)) {
 errors.push('engines.notron: must be a valid semver range (e.g. "^0.3.0", ">=0.3.0", "1.0.0")');
 }
 // warn about extra engine keys? not error
 }

 for (const key of ['extensionDependencies', 'extensionPack'] as const) {
 if (m[key] !== undefined) {
 if (!Array.isArray(m[key])) {
 errors.push(`${key}: must be an array of extension ids if provided`);
 } else {
 for (let i = 0; i < (m[key] as unknown[]).length; i++) {
 const v = (m[key] as unknown[])[i];
 if (typeof v !== 'string' || v.trim().length === 0) {
 errors.push(`${key}[${i}]: must be non-empty string`);
 } else if (!ID_REGEX.test(v)) {
 errors.push(`${key}[${i}]: must match publisher.name format`);
 }
 }
 }
 }
 }

 if (!isNonEmptyString(m.main)) {
 errors.push('main: required, non-empty string (relative path to JS entry)');
 }

 if (m.activationEvents === undefined) {
 errors.push('activationEvents: required');
 } else {
 const ae = validateActivationEvents(m.activationEvents);
 for (const e of ae.errors) errors.push(e);
 }

 if (m.permissions !== undefined) {
 const pe = validatePermissions(m.permissions);
 for (const e of pe.errors) errors.push(e);
 }

 if (m.contributes !== undefined) {
 if (!isRecord(m.contributes)) {
 errors.push('contributes: must be an object if provided');
 } else {
 const c = m.contributes as Record<string, unknown>;
 // commands
 if (c.commands !== undefined) {
 if (!Array.isArray(c.commands)) {
 errors.push('contributes.commands: must be an array');
 } else {
 for (let i = 0; i < c.commands.length; i++) {
 const cmd = (c.commands as unknown[])[i];
 if (!isRecord(cmd)) {
 errors.push(`contributes.commands[${i}]: must be an object`);
 continue;
 }
 const r = cmd as Record<string, unknown>;
 if (!isNonEmptyString(r.command)) errors.push(`contributes.commands[${i}].command: required non-empty string`);
 if (!isNonEmptyString(r.title)) errors.push(`contributes.commands[${i}].title: required non-empty string`);
 for (const opt of ['category', 'icon', 'enablement'] as const) {
 if (r[opt] !== undefined && typeof r[opt] !== 'string') {
 errors.push(`contributes.commands[${i}].${opt}: must be a string if provided`);
 }
 }
 }
 }
 }
 // menus
 if (c.menus !== undefined) {
 if (!isRecord(c.menus)) {
 errors.push('contributes.menus: must be an object');
 } else {
 for (const [menuKey, items] of Object.entries(c.menus as Record<string, unknown>)) {
 if (!(ALLOWED_MENU_LOCATIONS as readonly string[]).includes(menuKey)) {
 errors.push(`contributes.menus: invalid menu location "${menuKey}" — allowed: ${ALLOWED_MENU_LOCATIONS.join(', ')}`);
 }
 if (!Array.isArray(items)) {
 errors.push(`contributes.menus["${menuKey}"]: must be an array`);
 continue;
 }
 for (let i = 0; i < items.length; i++) {
 const it = (items as unknown[])[i];
 if (!isRecord(it)) {
 errors.push(`contributes.menus["${menuKey}"][${i}]: must be an object`);
 continue;
 }
 const r = it as Record<string, unknown>;
 if (!isNonEmptyString(r.command)) errors.push(`contributes.menus["${menuKey}"][${i}].command: required non-empty string`);
 for (const opt of ['when', 'group', 'alt'] as const) {
 if (r[opt] !== undefined && typeof r[opt] !== 'string') {
 errors.push(`contributes.menus["${menuKey}"][${i}].${opt}: must be a string if provided`);
 }
 }
 }
 }
 }
 }
 // keybindings
 if (c.keybindings !== undefined) {
 if (!Array.isArray(c.keybindings)) {
 errors.push('contributes.keybindings: must be an array');
 } else {
 for (let i = 0; i < c.keybindings.length; i++) {
 const kb = (c.keybindings as unknown[])[i];
 if (!isRecord(kb)) {
 errors.push(`contributes.keybindings[${i}]: must be an object`);
 continue;
 }
 const r = kb as Record<string, unknown>;
 if (!isNonEmptyString(r.command)) errors.push(`contributes.keybindings[${i}].command: required non-empty string`);
 if (!isNonEmptyString(r.key)) errors.push(`contributes.keybindings[${i}].key: required non-empty string`);
 for (const opt of ['mac', 'when'] as const) {
 if (r[opt] !== undefined && typeof r[opt] !== 'string') {
 errors.push(`contributes.keybindings[${i}].${opt}: must be a string if provided`);
 }
 }
 }
 }
 }
 // viewsContainers
 if (c.viewsContainers !== undefined) {
 if (!isRecord(c.viewsContainers)) {
 errors.push('contributes.viewsContainers: must be an object');
 } else {
 const vc = c.viewsContainers as Record<string, unknown>;
 for (const loc of ['activitybar', 'panel'] as const) {
 if (vc[loc] !== undefined) {
 if (!Array.isArray(vc[loc])) {
 errors.push(`contributes.viewsContainers.${loc}: must be an array`);
 } else {
 for (let i = 0; i < (vc[loc] as unknown[]).length; i++) {
 const v = (vc[loc] as unknown[])[i];
 if (!isRecord(v)) {
 errors.push(`contributes.viewsContainers.${loc}[${i}]: must be an object`);
 continue;
 }
 const r = v as Record<string, unknown>;
 if (!isNonEmptyString(r.id)) errors.push(`contributes.viewsContainers.${loc}[${i}].id: required non-empty string`);
 if (!isNonEmptyString(r.title)) errors.push(`contributes.viewsContainers.${loc}[${i}].title: required non-empty string`);
 if (!isNonEmptyString(r.icon)) errors.push(`contributes.viewsContainers.${loc}[${i}].icon: required non-empty string`);
 }
 }
 }
 }
 // check for unknown keys
 for (const k of Object.keys(vc)) {
 if (k !== 'activitybar' && k !== 'panel') {
 errors.push(`contributes.viewsContainers: unknown location "${k}" — allowed: activitybar, panel`);
 }
 }
 }
 }
 // views
 if (c.views !== undefined) {
 if (!isRecord(c.views)) {
 errors.push('contributes.views: must be an object (record containerId -> View[])');
 } else {
 for (const [containerId, views] of Object.entries(c.views as Record<string, unknown>)) {
 if (!isNonEmptyString(containerId)) {
 errors.push('contributes.views: container id must be non-empty string');
 }
 if (!Array.isArray(views)) {
 errors.push(`contributes.views["${containerId}"]: must be an array`);
 continue;
 }
 for (let i = 0; i < views.length; i++) {
 const v = (views as unknown[])[i];
 if (!isRecord(v)) {
 errors.push(`contributes.views["${containerId}"][${i}]: must be an object`);
 continue;
 }
 const r = v as Record<string, unknown>;
 if (!isNonEmptyString(r.id)) errors.push(`contributes.views["${containerId}"][${i}].id: required non-empty string`);
 if (!isNonEmptyString(r.name)) errors.push(`contributes.views["${containerId}"][${i}].name: required non-empty string`);
 if (r.type !== undefined && r.type !== 'tree' && r.type !== 'webview') {
 errors.push(`contributes.views["${containerId}"][${i}].type: must be "tree" or "webview" if provided`);
 }
 for (const opt of ['when', 'icon'] as const) {
 if (r[opt] !== undefined && typeof r[opt] !== 'string') {
 errors.push(`contributes.views["${containerId}"][${i}].${opt}: must be a string if provided`);
 }
 }
 }
 }
 }
 }
 // languages
 if (c.languages !== undefined) {
 if (!Array.isArray(c.languages)) {
 errors.push('contributes.languages: must be an array');
 } else {
 for (let i = 0; i < c.languages.length; i++) {
 const lang = (c.languages as unknown[])[i];
 if (!isRecord(lang)) {
 errors.push(`contributes.languages[${i}]: must be an object`);
 continue;
 }
 const r = lang as Record<string, unknown>;
 if (!isNonEmptyString(r.id)) errors.push(`contributes.languages[${i}].id: required non-empty string`);
 if (!Array.isArray(r.extensions)) {
 errors.push(`contributes.languages[${i}].extensions: required array of strings (e.g. [".ntrn"])`);
 } else {
 for (let j = 0; j < (r.extensions as unknown[]).length; j++) {
 if (typeof (r.extensions as unknown[])[j] !== 'string') {
 errors.push(`contributes.languages[${i}].extensions[${j}]: must be a string`);
 }
 }
 }
 if (r.aliases !== undefined && !isStringArray(r.aliases)) {
 errors.push(`contributes.languages[${i}].aliases: must be string array if provided`);
 }
 if (r.configuration !== undefined && typeof r.configuration !== 'string') {
 errors.push(`contributes.languages[${i}].configuration: must be a string if provided`);
 }
 }
 }
 }
 // grammars
 if (c.grammars !== undefined) {
 if (!Array.isArray(c.grammars)) {
 errors.push('contributes.grammars: must be an array');
 } else {
 for (let i = 0; i < c.grammars.length; i++) {
 const g = (c.grammars as unknown[])[i];
 if (!isRecord(g)) {
 errors.push(`contributes.grammars[${i}]: must be an object`);
 continue;
 }
 const r = g as Record<string, unknown>;
 if (!isNonEmptyString(r.language)) errors.push(`contributes.grammars[${i}].language: required non-empty string`);
 if (!isNonEmptyString(r.scopeName)) errors.push(`contributes.grammars[${i}].scopeName: required non-empty string`);
 if (!isNonEmptyString(r.path)) errors.push(`contributes.grammars[${i}].path: required non-empty string`);
 }
 }
 }
 // themes / iconThemes / productIconThemes
 for (const key of ['themes', 'iconThemes', 'productIconThemes'] as const) {
 if (c[key] !== undefined) {
 if (!Array.isArray(c[key])) {
 errors.push(`contributes.${key}: must be an array`);
 } else {
 for (let i = 0; i < (c[key] as unknown[]).length; i++) {
 const t = (c[key] as unknown[])[i];
 if (!isRecord(t)) {
 errors.push(`contributes.${key}[${i}]: must be an object`);
 continue;
 }
 const r = t as Record<string, unknown>;
 if (!isNonEmptyString(r.id)) errors.push(`contributes.${key}[${i}].id: required non-empty string`);
 if (!isNonEmptyString(r.label)) errors.push(`contributes.${key}[${i}].label: required non-empty string`);
 if (!isNonEmptyString(r.path)) errors.push(`contributes.${key}[${i}].path: required non-empty string`);
 if (key === 'themes') {
 if (r.uiTheme !== 'light' && r.uiTheme !== 'dark') {
 errors.push(`contributes.themes[${i}].uiTheme: must be "light" or "dark"`);
 }
 }
 }
 }
 }
 }
 // snippets
 if (c.snippets !== undefined) {
 if (!Array.isArray(c.snippets)) {
 errors.push('contributes.snippets: must be an array');
 } else {
 for (let i = 0; i < c.snippets.length; i++) {
 const s = (c.snippets as unknown[])[i];
 if (!isRecord(s)) {
 errors.push(`contributes.snippets[${i}]: must be an object`);
 continue;
 }
 const r = s as Record<string, unknown>;
 if (!isNonEmptyString(r.language)) errors.push(`contributes.snippets[${i}].language: required non-empty string`);
 if (!isNonEmptyString(r.path)) errors.push(`contributes.snippets[${i}].path: required non-empty string`);
 }
 }
 }
 // configuration
 if (c.configuration !== undefined) {
 if (!isRecord(c.configuration)) {
 errors.push('contributes.configuration: must be an object');
 } else {
 const conf = c.configuration as Record<string, unknown>;
 if (!isNonEmptyString(conf.title)) errors.push('contributes.configuration.title: required non-empty string');
 if (!isRecord(conf.properties)) {
 errors.push('contributes.configuration.properties: required object');
 } else {
 for (const [propKey, propVal] of Object.entries(conf.properties as Record<string, unknown>)) {
 if (!isNonEmptyString(propKey)) {
 errors.push('contributes.configuration.properties: key must be non-empty string');
 }
 if (!isRecord(propVal)) {
 errors.push(`contributes.configuration.properties["${propKey}"]: must be an object`);
 continue;
 }
 const pv = propVal as Record<string, unknown>;
 const validTypes = ['string', 'number', 'boolean', 'array', 'object'];
 if (typeof pv.type !== 'string' || !validTypes.includes(pv.type)) {
 errors.push(`contributes.configuration.properties["${propKey}"].type: must be one of ${validTypes.join(', ')}`);
 }
 if (pv.description !== undefined && typeof pv.description !== 'string') {
 errors.push(`contributes.configuration.properties["${propKey}"].description: must be a string if provided`);
 }
 if (pv.enum !== undefined && !Array.isArray(pv.enum)) {
 errors.push(`contributes.configuration.properties["${propKey}"].enum: must be an array if provided`);
 }
 }
 }
 }
 }
 // debuggers
 if (c.debuggers !== undefined) {
 if (!Array.isArray(c.debuggers)) {
 errors.push('contributes.debuggers: must be an array');
 } else {
 for (let i = 0; i < c.debuggers.length; i++) {
 const d = (c.debuggers as unknown[])[i];
 if (!isRecord(d)) {
 errors.push(`contributes.debuggers[${i}]: must be an object`);
 continue;
 }
 const r = d as Record<string, unknown>;
 if (!isNonEmptyString(r.type)) errors.push(`contributes.debuggers[${i}].type: required non-empty string`);
 if (!isNonEmptyString(r.label)) errors.push(`contributes.debuggers[${i}].label: required non-empty string`);
 if (r.program !== undefined && typeof r.program !== 'string') {
 errors.push(`contributes.debuggers[${i}].program: must be a string if provided`);
 }
 }
 }
 }
 // taskDefinitions
 if (c.taskDefinitions !== undefined) {
 if (!Array.isArray(c.taskDefinitions)) {
 errors.push('contributes.taskDefinitions: must be an array');
 } else {
 for (let i = 0; i < c.taskDefinitions.length; i++) {
 const t = (c.taskDefinitions as unknown[])[i];
 if (!isRecord(t)) {
 errors.push(`contributes.taskDefinitions[${i}]: must be an object`);
 continue;
 }
 const r = t as Record<string, unknown>;
 if (!isNonEmptyString(r.type)) errors.push(`contributes.taskDefinitions[${i}].type: required non-empty string`);
 if (r.properties !== undefined && !isRecord(r.properties)) {
 errors.push(`contributes.taskDefinitions[${i}].properties: must be an object if provided`);
 } else if (isRecord(r.properties)) {
 for (const [pk, pv] of Object.entries(r.properties as Record<string, unknown>)) {
 if (!isRecord(pv)) {
 errors.push(`contributes.taskDefinitions[${i}].properties["${pk}"]: must be an object`);
 continue;
 }
 const pvr = pv as Record<string, unknown>;
 if (typeof pvr.type !== 'string') {
 errors.push(`contributes.taskDefinitions[${i}].properties["${pk}"].type: required string`);
 }
 if (pvr.description !== undefined && typeof pvr.description !== 'string') {
 errors.push(`contributes.taskDefinitions[${i}].properties["${pk}"].description: must be a string if provided`);
 }
 }
 }
 }
 }
 }
 }
 }

 return makeResult(errors);
}


function sha256HexSync(bytes: Uint8Array): string {
 const K = new Uint32Array([
 0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
 ]);
 const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
 const l = bytes.length;
 const bitLen = l * 8;
 const withOne = new Uint8Array(l + 1);
 withOne.set(bytes);
 withOne[l] = 0x80;
 const len = withOne.length;
 const zeroPadLen = (56 - (len % 64) + 64) % 64;
 const padded = new Uint8Array(len + zeroPadLen + 8);
 padded.set(withOne);
 const view = new DataView(padded.buffer);
 const high = Math.floor(bitLen / 0x100000000);
 const low = bitLen >>> 0;
 view.setUint32(padded.length - 8, high, false);
 view.setUint32(padded.length - 4, low, false);
 for (let i = 0; i < padded.length; i += 64) {
 const W = new Uint32Array(64);
 for (let t = 0; t < 16; t++) W[t] = view.getUint32(i + t * 4, false);
 for (let t = 16; t < 64; t++) {
 const s0 = ((W[t - 15]! >>> 7) | (W[t - 15]! << 25)) ^ ((W[t - 15]! >>> 18) | (W[t - 15]! << 14)) ^ (W[t - 15]! >>> 3);
 const s1 = ((W[t - 2]! >>> 17) | (W[t - 2]! << 15)) ^ ((W[t - 2]! >>> 19) | (W[t - 2]! << 13)) ^ (W[t - 2]! >>> 10);
 W[t] = (W[t - 16]! + s0 + W[t - 7]! + s1) >>> 0;
 }
 let a = H[0]!, b = H[1]!, c = H[2]!, d = H[3]!, e = H[4]!, f = H[5]!, g = H[6]!, h = H[7]!;
 for (let t = 0; t < 64; t++) {
 const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
 const ch = (e & f) ^ (~e & g);
 const temp1 = (h + S1 + ch + K[t]! + W[t]!) >>> 0;
 const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
 const maj = (a & b) ^ (a & c) ^ (b & c);
 const temp2 = (S0 + maj) >>> 0;
 h = g;
 g = f;
 f = e;
 e = (d + temp1) >>> 0;
 d = c;
 c = b;
 b = a;
 a = (temp1 + temp2) >>> 0;
 }
 H[0] = (H[0]! + a) >>> 0;
 H[1] = (H[1]! + b) >>> 0;
 H[2] = (H[2]! + c) >>> 0;
 H[3] = (H[3]! + d) >>> 0;
 H[4] = (H[4]! + e) >>> 0;
 H[5] = (H[5]! + f) >>> 0;
 H[6] = (H[6]! + g) >>> 0;
 H[7] = (H[7]! + h) >>> 0;
 }
 let hex = '';
 for (let i = 0; i < 8; i++) hex += H[i]!.toString(16).padStart(8, '0');
 return hex;
}

function toBytes(data: Uint8Array | string): Uint8Array {
 if (typeof data === 'string') return new TextEncoder().encode(data);
 return data as Uint8Array;
}

export function computeChecksumSync(data: Uint8Array | string): string {
 const bytes = toBytes(data);
 return `sha256:${sha256HexSync(bytes)}`;
}

export async function computeChecksum(data: Uint8Array | string): Promise<string> {
 const bytes = toBytes(data);
 const subtle = (globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
 if (subtle) {
 try {
 const digest = await subtle.digest('SHA-256', bytes as BufferSource);
 const arr = Array.from(new Uint8Array(digest));
 const hex = arr.map((b) => b.toString(16).padStart(2, '0')).join('');
 return `sha256:${hex}`;
 } catch {
 // fall through to sync
 }
 }
 return computeChecksumSync(bytes);
}

export async function verifyChecksum(
 data: Uint8Array | string,
 expected: string,
): Promise<boolean> {
 const computed = await computeChecksum(data);
 const normalized = expected.startsWith('sha256:') ? expected : `sha256:${expected}`;
 return computed === normalized;
}

export function verifyChecksumSync(data: Uint8Array | string, expected: string): boolean {
 const computed = computeChecksumSync(data);
 const normalized = expected.startsWith('sha256:') ? expected : `sha256:${expected}`;
 return computed === normalized;
}

export async function generateChecksums(
 files: Record<string, Uint8Array | string>,
): Promise<Record<string, string>> {
 const out: Record<string, string> = {};
 for (const [p, content] of Object.entries(files)) {
 out[p] = await computeChecksum(content);
 }
 return out;
}

/** Synchronous variant. */
export function generateChecksumsSync(files: Record<string, Uint8Array | string>): Record<string, string> {
 const out: Record<string, string> = {};
 for (const [p, content] of Object.entries(files)) out[p] = computeChecksumSync(content);
 return out;
}
