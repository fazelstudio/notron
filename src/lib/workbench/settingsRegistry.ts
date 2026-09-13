/**
 * Settings Schema Registry
 *
 * Central schema for all settings. Extensions declare their settings here
 * (key, type, default, description) and the Settings UI renders from this
 * single source — no scattered config state.
 */

export type SettingType = 'string' | 'number' | 'boolean' | 'enum';

export interface SettingSchema {
  /** Setting key — must match a key of `AppSettings` for store-backed values. */
  key: string;
  /** Type of the setting */
  type: SettingType;
  /** Default value */
  default: unknown;
  /** Label shown in the Settings UI */
  title?: string;
  /** Human-readable description */
  description: string;
  /** For enum: allowed values */
  enum?: string[];
  /** Settings section id used for grouping in UI (e.g. `general`, `editor`) */
  category?: string;
  /** For number settings rendered as a slider */
  min?: number;
  max?: number;
  step?: number;
  /** When false hidden from UI */
  when?: () => boolean;
}

class SettingsRegistry {
  private schemas = new Map<string, SettingSchema>();

  register(schema: SettingSchema): { dispose: () => void } {
    if (this.schemas.has(schema.key)) {
      console.warn(`[settingsRegistry] overwriting setting: ${schema.key}`);
    }
    this.schemas.set(schema.key, schema);
    return {
      dispose: () => {
        if (this.schemas.get(schema.key) === schema) this.schemas.delete(schema.key);
      }
    };
  }

  registerAll(schemas: SettingSchema[]): { dispose: () => void } {
    const disposables = schemas.map((s) => this.register(s));
    return { dispose: () => disposables.forEach((d) => d.dispose()) };
  }

  get(key: string): SettingSchema | undefined {
    return this.schemas.get(key);
  }

  getAll(): SettingSchema[] {
    return [...this.schemas.values()];
  }

  getByCategory(category: string): SettingSchema[] {
    return this.getAll().filter((s) => s.category === category);
  }
}

export const settingsRegistry = new SettingsRegistry();

// Built-in settings schema — the single declaration of every store-backed.
// Setting. Settings the Settings UI does not hand-render yet are produced.
// Automatically from these entries (see SettingsPage), so a contribution only.
// Needs to register a schema to appear in the UI.
// `category` matches a Settings section id (general, appearance, editor, files,
// Search, explorer, terminal) and `default` mirrors HARDCODED_DEFAULTS.
settingsRegistry.registerAll([
  { key: 'discord_presence', type: 'boolean', default: true, title: 'Discord Presence', description: 'Show your coding activity on your Discord profile.', category: 'general' },
  { key: 'confirm_delete', type: 'boolean', default: true, title: 'Confirm Before Delete', description: 'Show a confirmation dialog before deleting files or folders.', category: 'general' },
  { key: 'default_svg_view', type: 'enum', default: 'image', enum: ['image', 'code', 'split'], title: 'Default SVG View', description: 'How SVG files open by default in the editor.', category: 'general' },
  { key: 'default_md_view', type: 'enum', default: 'preview', enum: ['preview', 'code', 'split'], title: 'Default Markdown View', description: 'How Markdown files open by default in the editor.', category: 'general' },
  { key: 'theme', type: 'string', default: 'system', title: 'Theme', description: 'Controls the overall color scheme of the application.', category: 'appearance' },
  { key: 'font_family', type: 'string', default: 'JetBrains Mono, Consolas, monospace', title: 'Font Family', description: 'The font used in the code editor.', category: 'appearance' },
  { key: 'font_size', type: 'number', default: 14, min: 10, max: 32, step: 1, title: 'Font Size', description: 'The font size used in the editor.', category: 'appearance' },
  { key: 'icon_theme', type: 'string', default: 'default', title: 'Icon Theme', description: 'File icons displayed in the explorer sidebar.', category: 'appearance' },
  { key: 'tab_size', type: 'number', default: 4, min: 2, max: 8, step: 1, title: 'Tab Size', description: 'Number of spaces inserted when pressing Tab.', category: 'editor' },
  { key: 'word_wrap', type: 'boolean', default: false, title: 'Word Wrap', description: 'Wrap long lines that exceed the editor width.', category: 'editor' },
  { key: 'line_numbers', type: 'boolean', default: true, title: 'Line Numbers', description: 'Show or hide line numbers in the editor gutter.', category: 'editor' },
  { key: 'default_encoding', type: 'enum', default: 'UTF-8', enum: ['UTF-8', 'UTF-16', 'ISO-8859-1'], title: 'Default Encoding', description: 'Character encoding used when reading and writing files.', category: 'files' },
  { key: 'auto_save', type: 'boolean', default: false, title: 'Enable Auto Save', description: 'Automatically save modified files after a delay.', category: 'files' },
  { key: 'auto_save_delay_ms', type: 'number', default: 2000, min: 500, max: 10000, step: 500, title: 'Auto Save Delay', description: 'How long to wait after the last change before auto-saving.', category: 'files' },
  { key: 'default_shell', type: 'string', default: 'powershell', title: 'Default Shell', description: 'The shell used when opening a new integrated terminal.', category: 'terminal' },
]);
