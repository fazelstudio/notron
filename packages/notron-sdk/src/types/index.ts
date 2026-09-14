/**
 * Types
 *
 * Manifest and contribution types for extensions.
 */
// Primitive editor types (preserved)

export interface Uri {
 scheme: string;
 authority: string;
 path: string;
 query: string;
 fragment: string;
}

export interface Location {
 uri: Uri;
 range: Range;
}

export interface Range {
 start: Position;
 end: Position;
}

export interface Position {
 line: number;
 character: number;
}

// Manifest — Identity & Compatibility

export type ExtensionPermission =
 | 'fs:workspace-read'
 | 'fs:workspace-write'
 | 'fs:outside-workspace'
 | 'shell:execute'
 | 'network:fetch'
 | 'clipboard:read'
 | 'clipboard:write';

export type ActivationEvent =
 | `onCommand:${string}`
 | `onLanguage:${string}`
 | `onView:${string}`
 | `onUri`
 | `onStartupFinished`
 | `workspaceContains:${string}`
 | `onCustomEditor:${string}`
 | '*';

export interface ExtensionManifest {
 id: string;
 name: string;
 displayName?: string;
 description?: string;
 version: string;
 publisher: string;
 icon?: string;
 license?: string;
 repository?: string;
 keywords?: string[];
 categories?: string[];

 engines: {
 notron: string;
 };

 extensionDependencies?: string[];
 extensionPack?: string[];

 main: string;

 activationEvents: ActivationEvent[];

 contributes?: ExtensionContributes;

 permissions?: ExtensionPermission[];
}

// Contributions

export type MenuLocation =
 | 'commandPalette'
 | 'editor/context'
 | 'editor/title'
 | 'explorer/context'
 | 'view/title'
 | 'view/item/context'
 | 'tab/context'
 | 'menubar/file'
 | 'menubar/edit'
 | 'menubar/view'
 | 'menubar/run'
 | 'menubar/help'
 | 'pane/context';

export interface ExtensionContributes {
 commands?: CommandContribution[];
 menus?: Partial<Record<MenuLocation, MenuItemContribution[]>>;
 keybindings?: KeybindingContribution[];
 viewsContainers?: {
 activitybar?: ViewContainerContribution[];
 panel?: ViewContainerContribution[];
 };
 views?: Record<string, ViewContribution[]>;
 languages?: LanguageContribution[];
 grammars?: GrammarContribution[];
 themes?: ColorThemeContribution[];
 iconThemes?: IconThemeContribution[];
 productIconThemes?: ProductIconThemeContribution[];
 snippets?: SnippetContribution[];
 configuration?: ConfigurationContribution;
 debuggers?: DebuggerContribution[];
 taskDefinitions?: TaskDefinitionContribution[];
}


export interface CommandContribution {
 command: string;
 title: string;
 category?: string;
 icon?: string;
 enablement?: string;
}


export interface MenuItemContribution {
 command: string;
 when?: string;
 group?: string;
 alt?: string;
}


export interface KeybindingContribution {
 command: string;
 key: string;
 mac?: string;
 when?: string;
}


export interface ViewContainerContribution {
 id: string;
 title: string;
 icon: string;
}


export interface ViewContribution {
 id: string;
 name: string;
 type?: 'tree' | 'webview';
 when?: string;
 icon?: string;
}


export interface LanguageContribution {
 id: string;
 extensions: string[];
 aliases?: string[];
 configuration?: string;
}

// Notron uses CodeMirror 6 / Lezer highlighting, not TextMate.
// The path refers to a grammar module that exports a CodeMirror language extension.

export interface GrammarContribution {
 language: string;
 scopeName: string;
 path: string;
}


export interface ColorThemeContribution {
 id: string;
 label: string;
 uiTheme: 'light' | 'dark';
 path: string;
 isHighContrast?: boolean;
}

export interface IconThemeContribution {
 id: string;
 label: string;
 path: string;
}

export interface ProductIconThemeContribution {
 id: string;
 label: string;
 path: string;
}


export interface SnippetContribution {
 language: string;
 path: string;
}


export interface ConfigurationProperty {
 type: 'string' | 'number' | 'boolean' | 'array' | 'object';
 default?: unknown;
 description?: string;
 enum?: unknown[];
}

export interface ConfigurationContribution {
 title: string;
 category?: string;
 properties: Record<string, ConfigurationProperty>;
}


export interface DebuggerContribution {
 type: string;
 label: string;
 program?: string;
}

export interface TaskDefinitionContribution {
 type: string;
 properties?: Record<string, { type: string; description?: string }>;
}


export interface NotronExtensionConfig {
 /** Entry file relative to project root (default: `src/extension.ts`). */
 entry?: string;
 /** Output file relative to project root (default: `manifest.main` or `dist/extension.js`). */
 outfile?: string;
 /** Additional externals beyond `notron-sdk` (e.g. `['react']`). */
 external?: string[];
 /** esbuild target (default: `es2020`). */
 target?: string | string[];
 /** Output format — `cjs` (CommonJS, default) or `esm`. Host loads via dynamic import. */
 format?: 'cjs' | 'esm';
 /** Override minify (build: false, package: true). */
 minify?: boolean;
 /** Override sourcemap (build: true, package: false). */
 sourcemap?: boolean | 'inline' | 'external';
 /** Raw esbuild BuildOptions overrides (shallow-merged, takes precedence). */
 esbuildOptions?: Record<string, unknown>;
}

/** Helper for `notron-extension.config.ts` IntelliSense. */
export function defineConfig(config: NotronExtensionConfig): NotronExtensionConfig {
 return config;
}


/** Mapping from package-relative POSIX path to `sha256:<hex>` checksum. */
export type Checksums = Record<string, string>;

/** Optional signature placeholder (reserved for future code signing). */
export type PackageSignature = string | undefined;

// Validation helpers — re-exported for convenience

export interface ValidationResult {
 valid: boolean;
 errors: string[];
}
