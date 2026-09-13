import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { registerTheme } from '../../../src/lib/theme/registry';
import { __registerTheme } from '../../../packages/notron-sdk/src/api/theming';
export const id = "notron-hc-dark";
export const label = "High Contrast Dark";
export const isDark = true;
export const uiTheme = "dark";
export const isHighContrast = true;
export const settings = { background: "#000000", foreground: "#ffffff", selection: "#0078d4", gutterBackground: "#000000", gutterForeground: "#c5c5c5" };
const base = EditorView.theme({
  "&": { backgroundColor: "var(--nt-editor-bg)", color: "var(--nt-editor-fg)" },
  ".cm-content": { caretColor: "var(--nt-editor-cursor)" },
  ".cm-cursor": { borderLeftColor: "var(--nt-editor-cursor)", borderLeftWidth: "2px" },
  ".cm-selectionBackground": { backgroundColor: "var(--nt-editor-selection)", color: "var(--nt-editor-fg)" },
  ".cm-gutters": { backgroundColor: "var(--nt-editor-bg) !important", color: "var(--nt-editor-gutter-fg)", borderRight: "1px solid var(--nt-editor-border) !important" },
  ".cm-activeLineGutter": { backgroundColor: "var(--nt-editor-line-highlight)" },
  ".cm-activeLine": { backgroundColor: "var(--nt-editor-line-highlight)" },
}, { dark: true });
const hl = HighlightStyle.define([{ tag: t.keyword, color: "#569cd6" }, { tag: t.string, color: "#ce9178" }]);
export const extension = [base, syntaxHighlighting(hl)];
registerTheme(id, { extension, settings, isDark, label, uiTheme, isHighContrast });
__registerTheme({ id, label, uiTheme, path: "./themes/notron-hc-dark.ts", isHighContrast });
