/**
 * Settings store.
 *
 * Two scopes are layered like the editor:
 *  - User (global): saved via `save_global_setting`, applies to every workspace.
 *  - Workspace: saved via `save_workspace_setting`, overrides the user scope
 *    for the current workspace only.
 *
 * Effective value = HARDCODED_DEFAULTS ← user ← workspace.
 */

import { invoke } from '@tauri-apps/api/core';
import { SETTINGS_SAVE_DEBOUNCE_MS } from '../constants';
import type { TerminalType } from '../constants';

export interface AppSettings {
  theme: string;
  font_size: number;
  font_family: string;
  tab_size: number;
  word_wrap: boolean;
  line_numbers: boolean;
  auto_save: boolean;
  auto_save_delay_ms: number;
  default_encoding: string;
  icon_theme: string;
  search_exclude: string[];
  search_include: string[];
  default_svg_view: 'image' | 'code' | 'split';
  default_md_view: 'preview' | 'code' | 'split';
  discord_presence: boolean;
  default_shell: TerminalType;
  confirm_delete: boolean;
}

export const HARDCODED_DEFAULTS: AppSettings = {
  theme: 'system',
  font_size: 14,
  font_family: 'JetBrains Mono, Consolas, monospace',
  tab_size: 4,
  word_wrap: false,
  line_numbers: true,
  auto_save: false,
  auto_save_delay_ms: 2000,
  default_encoding: 'UTF-8',
  icon_theme: 'default',
  search_exclude: [],
  search_include: [],
  default_svg_view: 'image',
  default_md_view: 'preview',
  discord_presence: true,
  default_shell: 'powershell',
  confirm_delete: true,
};

export type SettingsScope = 'global' | 'workspace';

class SettingsStore {
  effectiveSettings = $state<AppSettings>({ ...HARDCODED_DEFAULTS });
  rawGlobalSettings = $state<Partial<AppSettings>>({});
  rawWorkspaceSettings = $state<Partial<AppSettings>>({});

  savePending = new Map<string, ReturnType<typeof setTimeout>>();
  workspaceId: string | null = null;

  async loadAllSettings(workspaceId?: string) {
    this.workspaceId = workspaceId ?? null;
    try {
      const [globalSettings, workspaceSettings] = await Promise.all([
        invoke<Partial<AppSettings>>('load_global_settings'),
        workspaceId ? invoke<Partial<AppSettings>>('load_workspace_settings', { workspaceId }) : Promise.resolve({}),
      ]);

      this.applyLoadedSettings(globalSettings, workspaceSettings, workspaceId);
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  // Apply settings that were already fetched (e.g. folded into the single
  // load_startup_state IPC round-trip). Avoids 2 extra startup calls.
  applyLoadedSettings(
    global: Partial<AppSettings> | null | undefined,
    workspace: Partial<AppSettings> | null | undefined,
    workspaceId?: string
  ) {
    if (workspaceId !== undefined) this.workspaceId = workspaceId ?? null;
    this.rawGlobalSettings = global || {};
    this.rawWorkspaceSettings = workspace || {};
    this.effectiveSettings = this.resolveSettings(this.rawGlobalSettings, this.rawWorkspaceSettings);
  }

  resolveSettings(global: Partial<AppSettings>, workspace: Partial<AppSettings>): AppSettings {
    const result = { ...HARDCODED_DEFAULTS };
    const apply = (map: Partial<AppSettings>) => {
      for (const [key, val] of Object.entries(map)) {
        if (val === undefined || val === null) continue;
        if (Array.isArray(val)) {
          const existing = (result as any)[key];
          (result as any)[key] = Array.isArray(existing) ? [...existing, ...val] : [...val];
        } else {
          (result as any)[key] = val;
        }
      }
    };
    apply(global);
    apply(workspace);
    return result;
  }

  updateSetting(key: keyof AppSettings, value: any, scope: SettingsScope = 'global') {
    (this.effectiveSettings as any)[key] = value;
    if (scope === 'global') {
      (this.rawGlobalSettings as any)[key] = value;
    } else {
      (this.rawWorkspaceSettings as any)[key] = value;
    }
    this.scheduleSave(key as string, value, scope);
  }

  // Search include/exclude lists (Layer 2 of the search config).
  private updatePatternList(
    field: 'search_exclude' | 'search_include',
    pattern: string,
    remove: boolean,
    scope: SettingsScope
  ) {
    const p = pattern.trim();
    if (!p) return;
    const cur: string[] = (this.effectiveSettings as any)[field] ?? [];
    const changed = remove ? cur.includes(p) : !cur.includes(p);
    if (!changed) return;
    const next = remove ? cur.filter((x) => x !== p) : [...cur, p];
    (this.effectiveSettings as any)[field] = next;
    if (scope === 'workspace') (this.rawWorkspaceSettings as any)[field] = next;
    else (this.rawGlobalSettings as any)[field] = next;
    this.scheduleSave(field, next, scope);
  }

  addSearchExclude(pattern: string) {
    this.updatePatternList('search_exclude', pattern, false, 'workspace');
  }
  removeSearchExclude(pattern: string) {
    this.updatePatternList('search_exclude', pattern, true, 'workspace');
  }
  addSearchInclude(pattern: string) {
    this.updatePatternList('search_include', pattern, false, 'workspace');
  }
  removeSearchInclude(pattern: string) {
    this.updatePatternList('search_include', pattern, true, 'workspace');
  }

  scheduleSave(key: string, value: any, scope: SettingsScope) {
    const existing = this.savePending.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      try {
        if (scope === 'global') {
          await invoke('save_global_setting', { key, value });
        } else if (this.workspaceId) {
          await invoke('save_workspace_setting', { workspaceId: this.workspaceId, key, value });
        }
      } catch (e) {
        console.error('Failed to save setting:', e);
      }
      // Only clear the marker if this is still the latest timer for the key.
      if (this.savePending.get(key) === timer) {
        this.savePending.delete(key);
      }
    }, SETTINGS_SAVE_DEBOUNCE_MS);

    this.savePending.set(key, timer);
  }

  async resetToGlobal(key: keyof AppSettings) {
    if (!this.workspaceId) return;
    // Cancel any pending workspace save so it cannot overwrite the deletion.
    const pending = this.savePending.get(key as string);
    if (pending) {
      clearTimeout(pending);
      this.savePending.delete(key as string);
    }
    try {
      await invoke('delete_workspace_setting', { workspaceId: this.workspaceId, key: key as string });
      delete (this.rawWorkspaceSettings as any)[key];
      const globalVal = (this.rawGlobalSettings as any)[key] ?? HARDCODED_DEFAULTS[key];
      (this.effectiveSettings as any)[key] = globalVal;
    } catch (e) {
      console.error('Failed to reset setting:', e);
    }
  }
}

export const settingsStore = new SettingsStore();
