<!--
 * Diff Editor
 *
 * Side-by-side diff view with themed added and removed styling.
-->

<script module lang="ts">
  import { EditorState } from '@codemirror/state';
  import { EditorView, lineNumbers, highlightSpecialChars } from '@codemirror/view';
  import { keymap } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { MergeView } from '@codemirror/merge';
  import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
  import { getThemeExtension } from '../../theme/registry';
  import { ntEditorOverride } from '../../theme/cm6-theme';
  import { closeBrackets } from '@codemirror/autocomplete';

  const basicExtensions = [
    lineNumbers(),
    highlightSpecialChars(),
    history(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
    ])
  ];

  const baseTheme = EditorView.theme({
    "&": { backgroundColor: "transparent !important", height: "100%" },
    ".cm-gutters": {
      backgroundColor: "var(--nt-editor-bg) !important",
      borderRight: "1px solid var(--nt-editor-border) !important",
      paddingLeft: "4px !important",
      paddingRight: "0px !important",
    },
    ".cm-scroller": { overflow: "auto !important", overscrollBehaviorX: "none !important" },
    ".cm-mergeView": { overflow: "hidden", height: "100%", width: "100%", display: "flex", flexDirection: "column" },
    ".cm-mergeViewEditors": { flex: "1 1 auto", display: "flex", height: "100%", overflow: "hidden" },
    ".cm-mergeViewEditor": { flex: "1 1 50%", overflow: "hidden", display: "flex", flexDirection: "column" },
    ".cm-panels": { zIndex: "10 !important" },
    ".cm-panels-top": { zIndex: "10 !important" },
  });

  // Build a diff-coloring theme derived from global CSS variables so the palette follows the active theme.
  function buildDiffTheme(): ReturnType<typeof EditorView.theme> {
    const del = {
      lineBg: 'color-mix(in srgb, var(--nt-status-error) 12%, var(--nt-editor-bg))',
      textBg: 'color-mix(in srgb, var(--nt-status-error) 22%, transparent)',
      gutterBg: 'var(--nt-status-error)',
      border: 'var(--nt-status-error)',
    };
    const ins = {
      lineBg: 'color-mix(in srgb, var(--nt-status-success) 12%, var(--nt-editor-bg))',
      textBg: 'color-mix(in srgb, var(--nt-status-success) 22%, transparent)',
      gutterBg: 'var(--nt-status-success)',
      border: 'var(--nt-status-success)',
    };
    const ghostBg = 'color-mix(in srgb, var(--nt-status-error) 10%, transparent)';
    const spacerBg = 'color-mix(in srgb, var(--nt-editor-border) 35%, transparent)';
    const spacerBdr = 'var(--nt-editor-border)';

    return EditorView.theme({
      // Left editor shows removed lines.
      '&.cm-merge-a .cm-changedLine': {
        backgroundColor: `${del.lineBg} !important`,
        borderLeft: `3px solid ${del.border} !important`,
      },
      '&.cm-merge-a .cm-changedText': {
        backgroundColor: `${del.textBg} !important`,
        borderRadius: '2px',
      },
      '&.cm-merge-a .cm-changedLineGutter': {
        background: `${del.gutterBg} !important`,
        color: 'var(--text-on-error) !important',
      },
      '.cm-deletedChunk': {
        background: `${del.lineBg} !important`,
        borderLeft: `3px solid ${del.border} !important`,
      },
      '.cm-deletedLineGutter': {
        background: `${del.gutterBg} !important`,
        color: 'var(--text-on-error) !important',
      },
      '&.cm-merge-a .cm-deletedText, .cm-deletedChunk .cm-deletedText': {
        backgroundColor: `${del.textBg} !important`,
        borderRadius: '2px',
      },

      // Right editor shows added lines.
      '&.cm-merge-b .cm-changedLine': {
        backgroundColor: `${ins.lineBg} !important`,
        borderLeft: `3px solid ${ins.border} !important`,
      },
      '&.cm-merge-b .cm-changedText': {
        backgroundColor: `${ins.textBg} !important`,
        borderRadius: '2px',
      },
      '&.cm-merge-b .cm-changedLineGutter': {
        background: `${ins.gutterBg} !important`,
        color: 'var(--text-on-success) !important',
      },
      '&.cm-merge-b .cm-deletedText': {
        background: `${ghostBg} !important`,
        borderRadius: '2px',
      },

      // Spacer for collapsed unchanged context.
      '.cm-mergeSpacer': {
        background: spacerBg,
        borderTop: `1px dashed ${spacerBdr}`,
        borderBottom: `1px dashed ${spacerBdr}`,
      },

      '.cm-merge-revert button': {
        background: 'var(--nt-overlay-bg)',
        border: '1px solid var(--nt-overlay-border)',
        color: 'var(--nt-prim-accent)',
        borderRadius: '3px',
        fontSize: '10px',
        padding: '1px 5px',
        cursor: 'pointer',
      '.cm-merge-revert button:hover': {
        background: 'var(--nt-hover-bg)',
        borderColor: 'var(--nt-prim-accent)',
        color: 'var(--nt-prim-accent)',
      },
      '.cm-merge-revert button:focus-visible': {
        outline: '1px solid var(--nt-focus-border)',
        outlineOffset: '1px',
      },
      },
    });
  }
</script>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { themeStore } from '../../stores/theme';

  let {
    originalContent,
    currentContent,
    filePath,
    originalLabel = 'Original',
    currentLabel = 'Current',
    editable = false,
    onCurrentChange,
  }: {
    originalContent: string;
    currentContent?: string | null;
    filePath: string;
    originalLabel?: string;
    currentLabel?: string;
    /** Right side editable for working tree; commit compare stays read-only. */
    editable?: boolean;
    onCurrentChange?: (content: string) => void;
  } = $props();

  let diffContainer: HTMLDivElement;
  let mergeView: MergeView | null = $state(null);
  let isDark = $derived($themeStore.isDark);

  async function loadLanguage() {
    const { getLanguageExtension } = await import('../../utils/languageDetector');
    return await getLanguageExtension(filePath);
  }

  onMount(async () => {
    const langExt = await loadLanguage();
    const themeExt = getThemeExtension($themeStore.theme, isDark);
    const diffTheme = buildDiffTheme();

    const baseExtensions = [
      ...basicExtensions,
      baseTheme,
      themeExt,
      ntEditorOverride,
      langExt,
      diffTheme,
    ];

    const aExtensions = [...baseExtensions, EditorState.readOnly.of(true)];

    const bExtensions = [...baseExtensions];
    if (!editable) {
      bExtensions.push(EditorState.readOnly.of(true));
    } else {
      // Forward edits to the store so autosave and modified indicators stay in sync.
      bExtensions.push(
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onCurrentChange?.(update.state.doc.toString());
          }
        })
      );
    }

    mergeView = new MergeView({
      a: {
        doc: originalContent || "",
        extensions: aExtensions,
      },
      b: {
        doc: currentContent || "",
        extensions: bExtensions,
      },
      parent: diffContainer,
      orientation: "a-b", // Side-by-side with synced scrolling.
    });
  });

  onDestroy(() => {
    if (mergeView) {
      mergeView.destroy();
    }
  });
</script>

<div class="h-full w-full flex flex-col bg-[var(--nt-editor-bg)] text-primary relative" bind:this={diffContainer} style="height: 100%;">
  <div class="h-8 shrink-0 flex items-center border-b border-subtle px-4 bg-[var(--nt-overlay-bg)] text-xs text-muted justify-between">
    <div class="flex-1 text-center font-mono truncate">{originalLabel}</div>
    <div class="flex-1 text-center font-mono border-l border-subtle truncate">{currentLabel}</div>
  </div>
</div>

<style>
  :global(.cm-mergeView) {
    height: 100%;
    width: 100%;
  }
  /* Gutter markers must fill the full gutter column width */
  :global(.cm-changedLineGutter),
  :global(.cm-deletedLineGutter),
  :global(.cm-inlineChangedLineGutter) {
    width: 100%;
    display: block;
  }
</style>
