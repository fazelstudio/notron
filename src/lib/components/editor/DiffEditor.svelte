<script module lang="ts">
  import { EditorState } from '@codemirror/state';
  import { EditorView, lineNumbers, highlightSpecialChars } from '@codemirror/view';
  import { keymap } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { MergeView } from '@codemirror/merge';
  import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
  import { getThemeExtension } from '../../themes';
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

  // Base layout theme — stable across re-renders.
  const baseTheme = EditorView.theme({
    "&": { backgroundColor: "transparent !important", height: "100%" },
    ".cm-gutters": {
      backgroundColor: "var(--bg-canvas) !important",
      borderRight: "1px solid var(--border-subtle) !important",
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

  /**
   * Build a diff-coloring theme matching VSCode's diff editor style.
   *  Left side  (cm-merge-a) = removed  → red   background + gutter tint
   *  Right side (cm-merge-b) = added    → green background + gutter tint
   *  Inline character diff uses a deeper tint of the same hue.
   *  Colors are dark/light adaptive.
   */
  function buildDiffTheme(dark: boolean): ReturnType<typeof EditorView.theme> {
    const del = dark
      ? { lineBg: '#3f1818', textBg: '#6b2020', gutterBg: '#c74040', border: '#c74040' }
      : { lineBg: '#ffd7d5', textBg: '#f5b8b5', gutterBg: '#c43030', border: '#c43030' };
    const ins = dark
      ? { lineBg: '#1a3a1a', textBg: '#2a5c2a', gutterBg: '#38a838', border: '#38a838' }
      : { lineBg: '#d0f0d0', textBg: '#a6e0a6', gutterBg: '#2a8c2a', border: '#2a8c2a' };
    const ghostBg = dark ? 'rgba(200,60,60,0.10)' : 'rgba(180,40,40,0.07)';
    const spacerBg = dark ? 'rgba(80,80,80,0.22)' : 'rgba(160,160,160,0.14)';
    const spacerBdr = dark ? 'rgba(120,120,120,0.35)' : 'rgba(100,100,100,0.28)';

    return EditorView.theme({
      // ── Left editor: removed lines ──────────────────────────────────────────
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
        color: '#fff !important',
      },
      '.cm-deletedChunk': {
        background: `${del.lineBg} !important`,
        borderLeft: `3px solid ${del.border} !important`,
      },
      '.cm-deletedLineGutter': {
        background: `${del.gutterBg} !important`,
        color: '#fff !important',
      },
      '&.cm-merge-a .cm-deletedText, .cm-deletedChunk .cm-deletedText': {
        backgroundColor: `${del.textBg} !important`,
        borderRadius: '2px',
      },

      // ── Right editor: added lines ───────────────────────────────────────────
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
        color: '#fff !important',
      },
      '&.cm-merge-b .cm-deletedText': {
        background: `${ghostBg} !important`,
        borderRadius: '2px',
      },

      // ── Spacer / filler (collapsed unchanged context rows) ──────────────────
      '.cm-mergeSpacer': {
        background: spacerBg,
        borderTop: `1px dashed ${spacerBdr}`,
        borderBottom: `1px dashed ${spacerBdr}`,
      },

      // ── Revert button (← arrow between the two panes) ──────────────────────
      '.cm-merge-revert button': {
        background: dark ? '#2a4a6a' : '#cce4f7',
        border: `1px solid ${dark ? '#4a7aa8' : '#7ab3d8'}`,
        color: dark ? '#9ac8f0' : '#1a5a8a',
        borderRadius: '3px',
        fontSize: '10px',
        padding: '1px 5px',
        cursor: 'pointer',
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
    /** Right (current) side editable — used by the "Working Tree" tab so
     *  typing there behaves exactly like a normal editor. Commit-compare
     *  tabs keep both sides read-only. */
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
    const diffTheme = buildDiffTheme(isDark);

    const baseExtensions = [
      ...basicExtensions,
      baseTheme,
      themeExt,
      langExt,
      diffTheme,
    ];

    const aExtensions = [...baseExtensions, EditorState.readOnly.of(true)];

    const bExtensions = [...baseExtensions];
    if (!editable) {
      bExtensions.push(EditorState.readOnly.of(true));
    } else {
      // Push content edits back through the store so autosave / modified
      // indicators behave exactly like a normal editor tab. The MergeView
      // itself recomputes the diff chunks live as the doc changes.
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
      orientation: "a-b", // side-by-side; MergeView syncs scroll automatically
    });
  });

  onDestroy(() => {
    if (mergeView) {
      mergeView.destroy();
    }
  });
</script>

<div class="h-full w-full flex flex-col bg-canvas text-primary relative" bind:this={diffContainer} style="height: 100%;">
  <div class="h-8 shrink-0 flex items-center border-b border-subtle px-4 bg-surface-2 text-xs text-muted justify-between">
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