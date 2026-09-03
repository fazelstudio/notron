import {
  abcdef,
  abyss,
  androidstudio,
  andromeda,
  atomone,
  aura,
  basicDark,
  basicLight,
  bbedit,
  bespin,
  consoleDark,
  consoleLight,
  copilot,
  darcula,
  dracula,
  duotoneLight,
  duotoneDark,
  eclipse,
  githubLight,
  githubDark,
  gruvboxDark,
  gruvboxLight,
  kimbie,
  material,
  materialLight,
  materialDark,
  monokai,
  monokaiDimmed,
  noctisLilac,
  nord,
  okaidia,
  quietlight,
  red,
  solarizedLight,
  solarizedDark,
  sublime,
  tokyoNight,
  tokyoNightDay,
  tokyoNightStorm,
  tomorrowNightBlue,
  vscodeLight,
  vscodeDark,
  whiteDark,
  whiteLight,
  xcodeLight,
  xcodeDark,
  defaultSettingsAbcdef, defaultSettingsAbyss, defaultSettingsAndroidstudio,
  defaultSettingsAndromeda, defaultSettingsAtomone, defaultSettingsAura,
  defaultSettingsBasicDark, defaultSettingsBasicLight, defaultSettingsBbedit,
  defaultSettingsBespin, defaultSettingsConsoleDark, defaultSettingsConsoleLight,
  defaultSettingsCopilot, defaultSettingsDarcula, defaultSettingsDracula,
  defaultSettingsDuotoneDark, defaultSettingsDuotoneLight, defaultSettingsEclipse,
  defaultSettingsGithubDark, defaultSettingsGithubLight, defaultSettingsGruvboxDark,
  defaultSettingsGruvboxLight, defaultSettingsKimbie, defaultSettingsMaterial,
  defaultSettingsMaterialDark, defaultSettingsMaterialLight, defaultSettingsMonokai,
  defaultSettingsMonokaiDimmed, defaultSettingsNoctisLilac, defaultSettingsNord,
  defaultSettingsOkaidia, defaultSettingsQuietlight, defaultSettingsRed,
  defaultSettingsSolarizedDark, defaultSettingsSolarizedLight, defaultSettingsSublime,
  defaultSettingsTokyoNight, defaultSettingsTokyoNightStorm, defaultSettingsTokyoNightDay,
  defaultSettingsTomorrowNightBlue, defaultSettingsVscodeLight, defaultSettingsVscodeDark,
  defaultSettingsWhiteDark, defaultSettingsWhiteLight, defaultSettingsXcodeDark,
  defaultSettingsXcodeLight
} from '@uiw/codemirror-themes-all';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { DEFAULT_THEME } from '../constants';

// ── High Contrast Dark ────────────────────────────────────────────────────────
// Pure black (#000000) bg, white text, blue (#6fc3df) accent borders — VSCode HC
const hcDarkBase = EditorView.theme({
  '&': { backgroundColor: '#000000', color: '#ffffff' },
  '.cm-content': { caretColor: '#ffffff' },
  '.cm-cursor': { borderLeftColor: '#ffffff', borderLeftWidth: '2px' },
  '.cm-selectionBackground, ::selection': { backgroundColor: '#0078d4', color: '#ffffff' },
  '.cm-focused .cm-selectionBackground': { backgroundColor: '#0078d4' },
  '.cm-gutters': { backgroundColor: '#000000 !important', color: '#c5c5c5', borderRight: '1px solid #6fc3df !important' },
  '.cm-activeLineGutter': { backgroundColor: '#1a1a1a' },
  '.cm-activeLine': { backgroundColor: '#1a1a1a' },
  '.cm-matchingBracket': { outline: '1px solid #6fc3df', color: 'inherit' },
  '.cm-panels': { backgroundColor: '#000000', color: '#ffffff' },
  '.cm-panels-top': { borderBottom: '1px solid #6fc3df' },
  '.cm-tooltip': { backgroundColor: '#0c0c0c', border: '1px solid #6fc3df', color: '#ffffff' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#0078d4', color: '#ffffff' },
}, { dark: true });
const hcDarkHighlight = HighlightStyle.define([
  { tag: t.keyword, color: '#569cd6', fontWeight: 'bold' },
  { tag: t.controlKeyword, color: '#c586c0', fontWeight: 'bold' },
  { tag: t.string, color: '#ce9178' },
  { tag: t.number, color: '#b5cea8' },
  { tag: t.bool, color: '#569cd6' },
  { tag: t.null, color: '#569cd6' },
  { tag: t.comment, color: '#6a9955', fontStyle: 'italic' },
  { tag: t.variableName, color: '#9cdcfe' },
  { tag: t.definition(t.variableName), color: '#4fc1ff' },
  { tag: t.function(t.variableName), color: '#dcdcaa' },
  { tag: t.typeName, color: '#4ec9b0' },
  { tag: t.className, color: '#4ec9b0' },
  { tag: t.propertyName, color: '#9cdcfe' },
  { tag: t.attributeName, color: '#9cdcfe' },
  { tag: t.attributeValue, color: '#ce9178' },
  { tag: t.tagName, color: '#4ec9b0' },
  { tag: t.operator, color: '#d4d4d4' },
  { tag: t.punctuation, color: '#d4d4d4' },
  { tag: t.regexp, color: '#d16969' },
  { tag: t.escape, color: '#d7ba7d' },
]);
export const highContrastDark = [hcDarkBase, syntaxHighlighting(hcDarkHighlight)];

// ── High Contrast Light ───────────────────────────────────────────────────────
// Pure white (#ffffff) bg, black text, blue (#0078d4) accent borders — VSCode HC Light
const hcLightBase = EditorView.theme({
  '&': { backgroundColor: '#ffffff', color: '#000000' },
  '.cm-content': { caretColor: '#000000' },
  '.cm-cursor': { borderLeftColor: '#000000', borderLeftWidth: '2px' },
  '.cm-selectionBackground, ::selection': { backgroundColor: '#0078d4', color: '#ffffff' },
  '.cm-focused .cm-selectionBackground': { backgroundColor: '#0078d4' },
  '.cm-gutters': { backgroundColor: '#ffffff !important', color: '#333333', borderRight: '1px solid #0078d4 !important' },
  '.cm-activeLineGutter': { backgroundColor: '#e8f4fd' },
  '.cm-activeLine': { backgroundColor: '#e8f4fd' },
  '.cm-matchingBracket': { outline: '1px solid #0078d4', color: 'inherit' },
  '.cm-panels': { backgroundColor: '#ffffff', color: '#000000' },
  '.cm-panels-top': { borderBottom: '1px solid #0078d4' },
  '.cm-tooltip': { backgroundColor: '#ffffff', border: '1px solid #0078d4', color: '#000000' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#0078d4', color: '#ffffff' },
}, { dark: false });
const hcLightHighlight = HighlightStyle.define([
  { tag: t.keyword, color: '#0000ff', fontWeight: 'bold' },
  { tag: t.controlKeyword, color: '#af00db', fontWeight: 'bold' },
  { tag: t.string, color: '#a31515' },
  { tag: t.number, color: '#098658' },
  { tag: t.bool, color: '#0000ff' },
  { tag: t.null, color: '#0000ff' },
  { tag: t.comment, color: '#008000', fontStyle: 'italic' },
  { tag: t.variableName, color: '#001080' },
  { tag: t.definition(t.variableName), color: '#0070c1' },
  { tag: t.function(t.variableName), color: '#795e26' },
  { tag: t.typeName, color: '#267f99' },
  { tag: t.className, color: '#267f99' },
  { tag: t.propertyName, color: '#001080' },
  { tag: t.attributeName, color: '#e50000' },
  { tag: t.attributeValue, color: '#a31515' },
  { tag: t.tagName, color: '#800000' },
  { tag: t.angleBracket, color: '#800000' },
  { tag: t.operator, color: '#000000' },
  { tag: t.punctuation, color: '#000000' },
  { tag: t.regexp, color: '#811f3f' },
  { tag: t.escape, color: '#ee0000' },
]);
export const highContrastLight = [hcLightBase, syntaxHighlighting(hcLightHighlight)];

export const THEMES: Record<string, { extension: any, isDark: boolean, label: string, settings?: any }> = {
  'abcdef': { extension: abcdef, isDark: true, label: 'Abcdef', settings: defaultSettingsAbcdef },
  'abyss': { extension: abyss, isDark: true, label: 'Abyss', settings: defaultSettingsAbyss },
  'androidstudio': { extension: androidstudio, isDark: true, label: 'Android Studio', settings: defaultSettingsAndroidstudio },
  'andromeda': { extension: andromeda, isDark: true, label: 'Andromeda', settings: defaultSettingsAndromeda },
  'atomone': { extension: atomone, isDark: true, label: 'Atom One', settings: defaultSettingsAtomone },
  'aura': { extension: aura, isDark: true, label: 'Aura', settings: defaultSettingsAura },
  'basic-dark': { extension: basicDark, isDark: true, label: 'Basic Dark', settings: defaultSettingsBasicDark },
  'basic-light': { extension: basicLight, isDark: false, label: 'Basic Light', settings: defaultSettingsBasicLight },
  'bbedit': { extension: bbedit, isDark: false, label: 'BBEdit', settings: defaultSettingsBbedit },
  'bespin': { extension: bespin, isDark: true, label: 'Bespin', settings: defaultSettingsBespin },
  'console-dark': { extension: consoleDark, isDark: true, label: 'Console Dark', settings: defaultSettingsConsoleDark },
  'console-light': { extension: consoleLight, isDark: false, label: 'Console Light', settings: defaultSettingsConsoleLight },
  'copilot': { extension: copilot, isDark: true, label: 'Copilot', settings: defaultSettingsCopilot },
  'darcula': { extension: darcula, isDark: true, label: 'Darcula', settings: defaultSettingsDarcula },
  'dracula': { extension: dracula, isDark: true, label: 'Dracula', settings: defaultSettingsDracula },
  'duotone-light': { extension: duotoneLight, isDark: false, label: 'Duotone Light', settings: defaultSettingsDuotoneLight },
  'duotone-dark': { extension: duotoneDark, isDark: true, label: 'Duotone Dark', settings: defaultSettingsDuotoneDark },
  'eclipse': { extension: eclipse, isDark: false, label: 'Eclipse', settings: defaultSettingsEclipse },
  'github-light': { extension: githubLight, isDark: false, label: 'GitHub Light', settings: defaultSettingsGithubLight },
  'github-dark': { extension: githubDark, isDark: true, label: 'GitHub Dark', settings: defaultSettingsGithubDark },
  'gruvbox-dark': { extension: gruvboxDark, isDark: true, label: 'Gruvbox Dark', settings: defaultSettingsGruvboxDark },
  'gruvbox-light': { extension: gruvboxLight, isDark: false, label: 'Gruvbox Light', settings: defaultSettingsGruvboxLight },
  'hc-dark': { extension: highContrastDark, isDark: true, label: 'High Contrast Dark', settings: { background: '#000000', foreground: '#ffffff', selection: '#0078d4', gutterBackground: '#000000', gutterForeground: '#c5c5c5' } },
  'hc-light': { extension: highContrastLight, isDark: false, label: 'High Contrast Light', settings: { background: '#ffffff', foreground: '#000000', selection: '#0078d4', gutterBackground: '#ffffff', gutterForeground: '#333333' } },
  'kimbie': { extension: kimbie, isDark: true, label: 'Kimbie', settings: defaultSettingsKimbie },
  'material': { extension: material, isDark: true, label: 'Material', settings: defaultSettingsMaterial },
  'material-light': { extension: materialLight, isDark: false, label: 'Material Light', settings: defaultSettingsMaterialLight },
  'material-dark': { extension: materialDark, isDark: true, label: 'Material Dark', settings: defaultSettingsMaterialDark },
  'monokai': { extension: monokai, isDark: true, label: 'Monokai', settings: defaultSettingsMonokai },
  'monokai-dimmed': { extension: monokaiDimmed, isDark: true, label: 'Monokai Dimmed', settings: defaultSettingsMonokaiDimmed },
  'noctis-lilac': { extension: noctisLilac, isDark: false, label: 'Noctis Lilac', settings: defaultSettingsNoctisLilac },
  'nord': { extension: nord, isDark: true, label: 'Nord', settings: defaultSettingsNord },
  'okaidia': { extension: okaidia, isDark: true, label: 'Okaidia', settings: defaultSettingsOkaidia },
  'quietlight': { extension: quietlight, isDark: false, label: 'Quietlight', settings: defaultSettingsQuietlight },
  'red': { extension: red, isDark: true, label: 'Red', settings: defaultSettingsRed },
  'solarized-light': { extension: solarizedLight, isDark: false, label: 'Solarized Light', settings: defaultSettingsSolarizedLight },
  'solarized-dark': { extension: solarizedDark, isDark: true, label: 'Solarized Dark', settings: defaultSettingsSolarizedDark },
  'sublime': { extension: sublime, isDark: true, label: 'Sublime', settings: defaultSettingsSublime },
  'tokyo-night': { extension: tokyoNight, isDark: true, label: 'Tokyo Night', settings: defaultSettingsTokyoNight },
  'tokyo-night-day': { extension: tokyoNightDay, isDark: false, label: 'Tokyo Night Day', settings: defaultSettingsTokyoNightDay },
  'tokyo-night-storm': { extension: tokyoNightStorm, isDark: true, label: 'Tokyo Night Storm', settings: defaultSettingsTokyoNightStorm },
  'tomorrow-night-blue': { extension: tomorrowNightBlue, isDark: true, label: 'Tomorrow Night Blue', settings: defaultSettingsTomorrowNightBlue },
  'vscode-light': { extension: vscodeLight, isDark: false, label: 'VSCode Light', settings: defaultSettingsVscodeLight },
  'vscode-dark': { extension: vscodeDark, isDark: true, label: 'VSCode Dark', settings: defaultSettingsVscodeDark },
  'white-dark': { extension: whiteDark, isDark: true, label: 'White Dark', settings: defaultSettingsWhiteDark },
  'white-light': { extension: whiteLight, isDark: false, label: 'White Light', settings: defaultSettingsWhiteLight },
  'xcode-light': { extension: xcodeLight, isDark: false, label: 'Xcode Light', settings: defaultSettingsXcodeLight },
  'xcode-dark': { extension: xcodeDark, isDark: true, label: 'Xcode Dark', settings: defaultSettingsXcodeDark },
};

export function adjustColorOpacity(hex: string, alpha: number): string {
  // basic hex to rgba converter, assumes #RRGGBB or #RGB or #RRGGBBAA
  if (!hex || !hex.startsWith('#')) return hex;
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length >= 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  } else {
    return hex;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || !hex.startsWith('#')) return null;
  if (hex.length === 4) {
    return {
      r: parseInt(hex[1] + hex[1], 16),
      g: parseInt(hex[2] + hex[2], 16),
      b: parseInt(hex[3] + hex[3], 16),
    };
  }
  if (hex.length >= 7) {
    return {
      r: parseInt(hex.substring(1, 3), 16),
      g: parseInt(hex.substring(3, 5), 16),
      b: parseInt(hex.substring(5, 7), 16),
    };
  }
  return null;
}

function toHexByte(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
}

/**
 * Blends an opaque overlay color onto a solid base color with the given alpha
 * and returns the resulting opaque color.
 */
function tint(base: string, overlay: string, alpha: number): string {
  const baseRgb = hexToRgb(base);
  const overlayRgb = hexToRgb(overlay);
  if (!baseRgb || !overlayRgb) return base;
  return `#${toHexByte(overlayRgb.r * alpha + baseRgb.r * (1 - alpha))}${toHexByte(overlayRgb.g * alpha + baseRgb.g * (1 - alpha))}${toHexByte(overlayRgb.b * alpha + baseRgb.b * (1 - alpha))}`;
}

/**
 * Turns a possibly semi-transparent color (rgba() / #RRGGBBAA / transparent)
 * into an opaque color by blending it over the given solid background hex.
 * Used so surface colors (which many @uiw themes define with an alpha channel)
 * stay fully opaque when used as panel/dropdown backgrounds — otherwise the UI
 * behind them shows through.
 */
function solidify(color: string, background: string): string {
  if (!color) return color;
  let r = 0, g = 0, b = 0, a = 1;

  const m = color.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
    if (parts.length >= 3) {
      r = parts[0]; g = parts[1]; b = parts[2];
      a = /^rgba/i.test(m[0]) && parts.length >= 4 ? parts[3] : 1;
    } else {
      return color;
    }
  } else if (/^#[0-9a-f]{8}$/i.test(color)) {
    r = parseInt(color.substring(1, 3), 16);
    g = parseInt(color.substring(3, 5), 16);
    b = parseInt(color.substring(5, 7), 16);
    a = parseInt(color.substring(7, 9), 16) / 255;
  } else if (/^#[0-9a-f]{6}$/i.test(color) || /^#[0-9a-f]{3}$/i.test(color)) {
    return color; // already opaque
  } else if (color === 'transparent') {
    a = 0;
  } else {
    return color; // unknown format — pass through untouched
  }

  if (a >= 1) {
    return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
  }

  const bg = hexToRgb(background) || { r: 0, g: 0, b: 0 };
  return `#${toHexByte(r * a + bg.r * (1 - a))}${toHexByte(g * a + bg.g * (1 - a))}${toHexByte(b * a + bg.b * (1 - a))}`;
}

export function applyThemeVariables(themeName: string) {
  if (typeof window === 'undefined') return;
  
  // Resolve 'system' to actual theme based on OS preference
  let effectiveTheme = themeName;
  if (themeName === 'system') {
    const isDarkOS = window.matchMedia('(prefers-color-scheme: dark)').matches;
    effectiveTheme = isDarkOS ? DEFAULT_THEME : 'vscode-light';
  }

  const themeObj = THEMES[effectiveTheme];
  const settings = themeObj?.settings;
  const html = document.documentElement;

  if (settings) {
    // Background layers — surface colors derived from the theme with the
    // (sometimes semi-transparent) line highlight blended onto the solid
    // background, so panels/dropdowns never let the UI behind show through.
    const surface2 = solidify(settings.lineHighlight, settings.background) || settings.gutterBackground || settings.background;

    html.style.setProperty('--bg-canvas', settings.background);
    html.style.setProperty('--bg-surface', settings.gutterBackground || settings.background);
    html.style.setProperty('--bg-surface-2', surface2);
    html.style.setProperty('--bg-surface-3', tint(surface2, settings.foreground, 0.08));
    html.style.setProperty('--bg-surface-4', tint(surface2, settings.foreground, 0.15));
    html.style.setProperty('--bg-elevated', settings.gutterBackground || settings.background);

    // Interactive states
    html.style.setProperty('--bg-hover', adjustColorOpacity(settings.foreground, 0.1));
    html.style.setProperty('--bg-active', adjustColorOpacity(settings.foreground, 0.2));
    html.style.setProperty('--bg-selected', settings.selection);
    html.style.setProperty('--bg-selected-hover', adjustColorOpacity(settings.selection, 0.8));

    // Borders
    html.style.setProperty('--border-subtle', adjustColorOpacity(settings.foreground, 0.15));
    html.style.setProperty('--border-strong', adjustColorOpacity(settings.foreground, 0.3));
    html.style.setProperty('--border-focus', settings.caret || settings.selection);

    // Text
    html.style.setProperty('--text-primary', settings.foreground);
    html.style.setProperty('--text-secondary', adjustColorOpacity(settings.foreground, 0.75));
    html.style.setProperty('--text-muted', adjustColorOpacity(settings.foreground, 0.5));
    html.style.setProperty('--text-inverse', settings.background);
    html.style.setProperty('--text-on-accent', settings.background);

    // DECO-002: Dedicated dimmed color for git-ignored files (distinct from --text-muted)
    html.style.setProperty('--color-text-ignored', adjustColorOpacity(settings.foreground, 0.3));

    // Git decoration: Untracked files (green/teal, distinct from info-blue)
    html.style.setProperty('--color-untracked', '#1a7f37');

    // Accent
    html.style.setProperty('--accent', settings.caret || settings.selection);
    html.style.setProperty('--accent-hover', adjustColorOpacity(settings.caret || settings.selection, 0.8));
    html.style.setProperty('--accent-active', adjustColorOpacity(settings.caret || settings.selection, 0.9));

    // Icons / indicator / scrollbar — derived from the theme colors so all
    // chrome follows the active theme instead of the static :root/.dark values.
    html.style.setProperty('--icon-primary', settings.foreground);
    html.style.setProperty('--icon-secondary', adjustColorOpacity(settings.foreground, 0.7));
    html.style.setProperty('--icon-muted', adjustColorOpacity(settings.foreground, 0.4));
    html.style.setProperty('--icon-disabled', adjustColorOpacity(settings.foreground, 0.25));
    html.style.setProperty('--indicator-active', settings.caret || settings.selection);
    html.style.setProperty('--indicator-inactive', adjustColorOpacity(settings.foreground, 0.4));
    html.style.setProperty('--scrollbar-thumb', adjustColorOpacity(settings.foreground, 0.35));
    html.style.setProperty('--scrollbar-thumb-hover', adjustColorOpacity(settings.foreground, 0.5));
  } else {
    // Remove custom overrides so it falls back to app.css .dark / :root
    ['--bg-canvas', '--bg-surface', '--bg-surface-2', '--bg-surface-3', '--bg-surface-4', '--bg-elevated',
     '--bg-hover', '--bg-active', '--bg-selected', '--bg-selected-hover',
     '--border-subtle', '--border-strong', '--border-focus',
     '--text-primary', '--text-secondary', '--text-muted', '--text-inverse', '--text-on-accent',
     '--color-text-ignored', '--color-untracked',
     '--accent', '--accent-hover', '--accent-active',
     '--icon-primary', '--icon-secondary', '--icon-muted', '--icon-disabled',
     '--indicator-active', '--indicator-inactive',
     '--scrollbar-thumb', '--scrollbar-thumb-hover'].forEach(prop => {
      html.style.removeProperty(prop);
    });
  }
}

export function getThemeExtension(themeId: string, isDark: boolean) {
  if (themeId === 'system') {
    return isDark ? THEMES[DEFAULT_THEME].extension : THEMES['vscode-light'].extension;
  }
  return THEMES[themeId as keyof typeof THEMES]?.extension || THEMES[DEFAULT_THEME].extension;
}
