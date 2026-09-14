import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { theming, type ExtensionContext } from 'notron-sdk';
export const id = "notron-hc-light";
export const label = "High Contrast Light";
export const isDark = false;
export const uiTheme = "light";
export const isHighContrast = true;
export const settings = { background: "#ffffff", foreground: "#000000", selection: "#0078d4", gutterBackground: "#ffffff", gutterForeground: "#333333" };
const base = EditorView.theme({
  "&": { backgroundColor: "var(--nt-editor-bg)", color: "var(--nt-editor-fg)" },
  ".cm-content": { caretColor: "var(--nt-editor-cursor)" },
  ".cm-cursor": { borderLeftColor: "var(--nt-editor-cursor)", borderLeftWidth: "2px" },
  ".cm-selectionBackground": { backgroundColor: "var(--nt-editor-selection)", color: "var(--nt-editor-fg)" },
  ".cm-gutters": { backgroundColor: "var(--nt-editor-bg) !important", color: "var(--nt-editor-gutter-fg)", borderRight: "1px solid var(--nt-editor-border) !important" },
  ".cm-activeLineGutter": { backgroundColor: "var(--nt-editor-line-highlight)" },
  ".cm-activeLine": { backgroundColor: "var(--nt-editor-line-highlight)" },
}, { dark: false });
const hl = HighlightStyle.define([{ tag: t.keyword, color: "#0000ff" }, { tag: t.string, color: "#a31515" }]);
export const extension = [base, syntaxHighlighting(hl)];

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(theming.registerTheme({ id, label, uiTheme: uiTheme as any, path: "./themes/notron-hc-light.ts", extension, settings, isDark, isHighContrast }));
}

export async function deactivate(): Promise<void> {}
