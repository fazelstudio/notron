<script lang="ts">
  import { onMount, onDestroy, mount, unmount, type Snippet } from 'svelte';
  import { Compartment, EditorState, type Extension } from '@codemirror/state';
  import { lineNumbers, highlightActiveLineGutter, ViewPlugin, EditorView, keymap, type ViewUpdate } from '@codemirror/view';
  import { foldGutter } from '@codemirror/language';
  import { lintGutter } from '@codemirror/lint';
  import { undo, redo, selectAll, copyLineUp, copyLineDown, moveLineUp, moveLineDown, historyField } from '@codemirror/commands';
  import { stickyScroll } from '@fazelstudio/codemirror-stickyscroll';
  import { breadcrumbs } from '@fazelstudio/codemirror-breadcrumbs';
  import { gitGutter, hunksField, baselineContentFacet, gitGutterKeymap } from '@fazelstudio/codemirror-gitgutter';
  import { notronBreadcrumbsTheme, syncBreadcrumbBarIcons, ensureBreadcrumbObserver, disposeBreadcrumbObserver } from '../../editor/breadcrumbs';
  import { COMMON_EXTENSIONS, COMMON_EXTENSIONS_LARGE_FILE } from '../../editor/commonExtensions';
  import { searchResultHighlightExtensions, setSearchResultHighlight, clearSearchResultHighlight } from '../../editor/searchResultHighlight';
  import { materialIconState } from '../../utils/materialIconRenderer.svelte';
  import { settingsStore } from '../../stores/settings.svelte';
  import HorizontalScrollbar from '../common/HorizontalScrollbar.svelte';
  import EditorSearchWidget from './EditorSearchWidget.svelte';
  import EditorFoldMarker from '../common/EditorFoldMarker.svelte';
  import GitGutterPeekButton from '../common/GitGutterPeekButton.svelte';
  import ContextMenu, { type MenuItem } from '../common/ContextMenu.svelte';
  import { getThemeExtension } from '../../themes';
  import { showMinimap } from '@replit/codemirror-minimap';
  import { invoke } from '@tauri-apps/api/core';
  import { editorStore } from '../../stores/editor';
  import { buildReplaceRegex, applyReplacement } from '../../utils/replace';
  import { uiStore } from '../../stores/ui';
  import { themeStore } from '../../stores/theme';
  import { getGitFileContent, stageFile } from '../../services/git';
  import { renderBreadcrumbPathIcon } from '../../utils/breadcrumbPathIcons';
  import { LARGE_FILE_THRESHOLD_BYTES, SEARCH_RESULT_HIGHLIGHT_MS } from '../../constants';

  let { tabId, content, filePath, children, topRightOverlay, hideContent = false, isHeaderOnly = false, readOnly = false }: { tabId: string; content: string; filePath: string; children?: Snippet; topRightOverlay?: Snippet; hideContent?: boolean; isHeaderOnly?: boolean; readOnly?: boolean } = $props();

  let currentTabId: string | null = null;
  const editorStates = new Map<string, EditorState>();
  let editorEl: HTMLDivElement;
  let editorView = $state<EditorView | null>(null);
  let scrollDOM: HTMLElement | null = $state(null);
  let isDark = $derived($themeStore.isDark);
  let gutterWidth = $state(0);
  let docChangedCount = $state(0);
  let searchWidget = $state<ReturnType<typeof EditorSearchWidget> | null>(null);
  let searchMode = $state<'find' | 'replace'>('find');
  let pendingHighlightTimer: ReturnType<typeof setTimeout> | null = null;

  const tabsStore = editorStore.tabs;
  let currentTab = $derived($tabsStore.find((t: any) => t.id === tabId));
  let tabStatus = $derived(currentTab?.status);
  let isLargeFile = $derived(currentTab?.isLargeFile || (content && content.length > LARGE_FILE_THRESHOLD_BYTES));
  
  const foldMarkers = new Set<{ app: any, marker: HTMLElement }>();

  const customFoldGutter = foldGutter({
    markerDOM: (open) => {
      const marker = document.createElement("span");
      marker.className = "custom-fold-marker-wrapper";
      marker.style.display = "flex";
      marker.style.width = "100%";
      marker.style.height = "100%";
      
      const app = mount(EditorFoldMarker, {
        target: marker,
        props: { open }
      });
      foldMarkers.add({ app, marker });

      // Strip native title from parent so it doesn't conflict with Tooltip
      setTimeout(() => {
        const parent = marker.parentElement;
        if (parent) {
          parent.removeAttribute("title");
          const observer = new MutationObserver(() => {
            if (parent.hasAttribute("title")) parent.removeAttribute("title");
          });
          observer.observe(parent, { attributes: true, attributeFilter: ["title"] });
        }
      }, 0);

      return marker;
    }
  });

  /**
   * The git gutter peek view (from @fazelstudio/codemirror-gitgutter) renders
   * its toolbar buttons with the native `title` attribute. This plugin replaces
   * those native tooltips with the app's Tooltip component by wrapping each
   * button once it appears in the DOM.
   */
  const peekTooltipPlugin = ViewPlugin.fromClass(
    class {
      private observer: MutationObserver;
      private mounted = new Map<HTMLButtonElement, ReturnType<typeof mount>>();
      private view: EditorView;

      constructor(view: EditorView) {
        this.view = view;
        this.observer = new MutationObserver(() => this.scan());
        this.observer.observe(view.dom, { childList: true, subtree: true });
        this.scan();
      }

      scan() {
        const buttons = Array.from(
          this.view.dom.querySelectorAll<HTMLButtonElement>('button.cm-gitgutter-peek-btn')
        );

        // CodeMirror virtualizes block widgets: the peek view DOM is detached
        // when it scrolls out of view and re-attached (same node) when it
        // scrolls back. So we only tear down a wrapped button once a fresh
        // toolbar has taken its place (hunk navigation / peek closed + reopened).
        const hasNewToolbar = buttons.some((btn) => !this.mounted.has(btn));
        if (hasNewToolbar) {
          for (const [btn, app] of this.mounted) {
            if (!btn.isConnected) {
              unmount(app);
              this.mounted.delete(btn);
            }
          }
        }

        for (const btn of buttons) {
          if (this.mounted.has(btn)) continue;
          const titleText = btn.title;
          if (!titleText) continue;
          btn.removeAttribute('title');
          const app = mount(GitGutterPeekButton, {
            target: btn.parentElement as HTMLElement,
            anchor: btn,
            props: { content: titleText, button: btn }
          });
          this.mounted.set(btn, app);
        }
      }

      destroy() {
        this.observer.disconnect();
        for (const [, app] of this.mounted) unmount(app);
        this.mounted.clear();
      }
    }
  );



  const langCompartment = new Compartment();
  const themeCompartment = new Compartment();
  const lineNumbersCompartment = new Compartment();
  const wordWrapCompartment = new Compartment();
  const tabSizeCompartment = new Compartment();
  const minimapCompartment = new Compartment();
  const gutterCompartment = new Compartment();
  const gitGutterCompartment = new Compartment();
  const breadcrumbsCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();

  /** Builds the mini-map extensions, or an empty array when no mini-map is wanted. */
  function minimapExtension(): Extension[] {
    return [
      showMinimap.compute([hunksField, baselineContentFacet], (state) => {
        let gitGutterRecord: Record<number, string> = {};

        try {
          const baseline = state.facet(baselineContentFacet);
          const hunks = baseline ? (state.field(hunksField, false) ?? []) : [];
          for (const hunk of hunks) {
            let color = 'var(--color-success)'; // default success green
            if (hunk.type === 'modified') color = 'var(--color-info)'; // info blue
            else if (hunk.type === 'deleted') color = 'var(--color-error)'; // error red
            if (hunk.type === 'deleted') {
              const line = Math.min(hunk.fromB, state.doc.lines);
              if (line >= 1) gitGutterRecord[line] = color;
            } else {
              for (let l = hunk.fromB; l <= Math.min(hunk.toB, state.doc.lines); l++) {
                gitGutterRecord[l] = color;
              }
            }
          }
        } catch (_) {
          // State might not be fully initialized
        }

        return {
          create: (view) => {
            const dom = document.createElement('div');
            dom.className = 'cm-minimap-container';

            // Forward wheel events to the editor's scrollDOM since the minimap
            // is placed outside of it.
            dom.addEventListener('wheel', (e) => {
              e.preventDefault();
              view.scrollDOM.scrollTop += e.deltaY;
              view.scrollDOM.scrollLeft += e.deltaX;
            }, { passive: false });

            // FORCE it out of the scroller to guarantee it sits on top of text.
            // The plugin inserts the container into the scroller synchronously
            // AFTER this create() returns, so the move must happen after that —
            // a microtask does it before the next paint, so the minimap is in
            // its final position immediately (no visible "slide in" on open;
            // the old 50ms setTimeout showed it sitting in the scroller first).
            queueMicrotask(() => {
              if (view.dom && dom.isConnected) {
                view.dom.appendChild(dom);
              }
            });
            return { dom };
          },
          displayText: 'characters',
          showOverlay: 'always',
          gutters: [gitGutterRecord]
        };
      }),
    ];
  }

  const settings = settingsStore;
  const ui = uiStore;
  let iconThemeClass = $derived(`icon-theme-${settings.effectiveSettings.icon_theme}`);

  async function loadLanguage() {
    if (isLargeFile) {
      return;
    }
    const { getLanguageExtension } = await import('../../utils/languageDetector');
    const ext = await getLanguageExtension(filePath);
    if (editorView) {
      editorView.dispatch({
        effects: langCompartment.reconfigure(ext)
      });
    }
  }

  function readBreadcrumbDirectory(dir: string) {
    return invoke<any>('read_directory_flat', { path: dir, showDotFiles: false }).then(
      (node) =>
        (node || []).map((item: any) => ({
          name: item.name,
          path: item.path,
          isDir: item.is_dir,
          hasChildren: !!item.has_children,
        })),
    );
  }

  /**
   * The breadcrumb panel (`.cm-panels.cm-panels-top`) is a sticky top panel with
   * `z-index: 300`, while `@fazelstudio/codemirror-stickyscroll` pins its bar at
   * `position:absolute; top:0; z-index:10` — so the sticky bar would render
   * underneath (covered by) the breadcrumbs. Measure the panel and offset the
   * sticky bar below it. The installed plugin never writes `top` again, so a
   * one-time sync per mount/geometry/theme change is enough.
   */
  function syncStickyScrollOffset() {
    if (!editorView) return;
    const sticky = editorView.dom.querySelector<HTMLElement>('.cm-stickyscroll-container');
    const panels = editorView.dom.querySelector<HTMLElement>('.cm-panels.cm-panels-top');
    if (!sticky || !panels) return;
    sticky.style.top = `${panels.offsetHeight}px`;
  }

  function openFileFromBreadcrumbs(path: string) {
    window.dispatchEvent(new CustomEvent('request-open-file', { detail: { path } }));
  }

  function setupEditor() {
    if (!editorView) {
        editorView = new EditorView({ parent: editorEl });
        scrollDOM = editorView!.scrollDOM;
    }
    
    // Save old state
    if (currentTabId && editorStates.has(currentTabId)) {
        editorStates.set(currentTabId, editorView!.state);
    }
    currentTabId = tabId;

    let cursorScrollTimeout: ReturnType<typeof setTimeout> | null = null;

    // CodeMirror manages its own internal state (immutable document tree).
    // Svelte only needs the content at specific moments (see 4.2).
    let contentExtractTimer: ReturnType<typeof setTimeout> | null = null;
    const CONTENT_DEBOUNCE_MS = 500; // Extract only after user stops typing

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        docChangedCount++; // Trigger search match updates
        // Debounced extraction — don't extract on every keystroke
        if (contentExtractTimer) clearTimeout(contentExtractTimer);
        contentExtractTimer = setTimeout(() => {
          if (!editorView || isHeaderOnly) return;
          // Mark as modified immediately (cheap — just set isDirty flag)
          const content = editorView.state.doc.toString();
          editorStore.updateContent(tabId, content);
        }, CONTENT_DEBOUNCE_MS);
      }

      if (update.viewportChanged || update.docChanged || update.geometryChanged) {
        for (const item of foldMarkers) {
          if (!item.marker.isConnected) {
            unmount(item.app);
            foldMarkers.delete(item);
          }
        }
      }

      if (update.selectionSet || update.geometryChanged) {
        // Measure gutter width efficiently on geometry change
        if (update.geometryChanged && editorEl) {
          const gutters = editorEl.querySelector('.cm-gutters');
          if (gutters) {
            const w = (gutters as HTMLElement).offsetWidth;
            if (gutterWidth !== w) gutterWidth = w;
          }
          syncStickyScrollOffset();
        }

        if (cursorScrollTimeout) clearTimeout(cursorScrollTimeout);
        cursorScrollTimeout = setTimeout(() => {
          if (!editorView || isHeaderOnly) return;
          const pos = editorView.state.selection.main.head;
          const line = editorView.state.doc.lineAt(pos);
          editorStore.updateCursor(tabId, line.number, pos - line.from + 1);

          const scroll = editorView.scrollDOM;
          editorStore.updateScroll(tabId, scroll.scrollTop, scroll.scrollLeft);
        }, 500);
      }
    });

    let extBase = [
      ...(isLargeFile ? COMMON_EXTENSIONS_LARGE_FILE : COMMON_EXTENSIONS),
      ...(filePath.toLowerCase().endsWith('.svg') ? [] : [stickyScroll()]),
      breadcrumbsCompartment.of(breadcrumbs({
        filePath,
        workspaceRoot: $ui.explorerRoot || undefined,
        readDirectory: readBreadcrumbDirectory,
        onOpenFile: openFileFromBreadcrumbs,
        showPathHeader: false,
        renderPathIcon: renderBreadcrumbPathIcon,
      })),
      notronBreadcrumbsTheme,
      keymap.of([{
        key: 'Mod-f',
        run: () => {
          searchMode = 'find';
          uiStore.setFileSearchOpen(true);
          // Wait for DOM to render the widget if it wasn't open
          setTimeout(() => searchWidget?.focusInput(), 10);
          return true;
        }
      }]),
      EditorView.domEventHandlers({
        click: (event: MouseEvent) => {
          if (event.altKey) {
            handleGoToDefinition();
            event.preventDefault();
          }
        }
      }),
      peekTooltipPlugin,
      updateListener,
      langCompartment.of([]),
      themeCompartment.of(getThemeExtension($themeStore.theme, isDark)),
      gutterCompartment.of([lintGutter()]),
      lineNumbersCompartment.of(settings.effectiveSettings.line_numbers ? [
        lineNumbers(), 
        customFoldGutter, 
        highlightActiveLineGutter()
      ] : []),
      gitGutterCompartment.of([
        gitGutter({
          baseline: content || '',
          onStageHunk: () => {},
        }),
        keymap.of(gitGutterKeymap),
      ]),
      wordWrapCompartment.of(settings.effectiveSettings.word_wrap ? EditorView.lineWrapping : []),
      tabSizeCompartment.of(EditorState.tabSize.of(settings.effectiveSettings.tab_size)),
      minimapCompartment.of(!isLargeFile && $ui.isMinimapEnabled ? minimapExtension() : []),
      readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
      searchResultHighlightExtensions(),
    ];

    let state = editorStates.get(tabId);
    if (!state) {
        const tabData = editorStore.getTabsSnapshot().find(t => t.id === tabId);
        if (tabData && tabData.undoHistory && !isLargeFile) {
          try {
            state = EditorState.fromJSON(
              { doc: content || '', history: tabData.undoHistory },
              { extensions: extBase },
              { history: historyField }
            );
          } catch (e) {
            console.warn('Failed to restore history', e);
            state = EditorState.create({ doc: content || '', extensions: extBase });
          }
        } else {
          state = EditorState.create({ doc: content || '', extensions: extBase });
        }
        editorStates.set(tabId, state);
    }
    
    editorView!.setState(state);
    ensureBreadcrumbObserver(editorView);
    syncStickyScrollOffset();

    const scroll = editorStore.getScroll(tabId);
    if (scroll) {
      requestAnimationFrame(() => {
        if (editorView && scroll) {
          editorView.scrollDOM.scrollTop = scroll.top;
          editorView.scrollDOM.scrollLeft = scroll.left;
        }
      });
    }
    const cursor = editorStore.getCursor(tabId);
    if (cursor && !isLargeFile) {
      try {
        const line = editorView!.state.doc.line(cursor.line);
        const anchor = Math.min(line.from + cursor.column - 1, line.to);
        const head = cursor.endColumn ? Math.min(line.from + cursor.endColumn - 1, line.to) : anchor;
        editorView!.dispatch({
          selection: { anchor, head },
          scrollIntoView: true
        });
      } catch {}
    }

    loadLanguage();
    requestAnimationFrame(() => {
      if (editorView) {
        syncBreadcrumbBarIcons(editorView);
        setTimeout(() => {
          if (editorView) syncBreadcrumbBarIcons(editorView);
        }, 50);
      }
    });
  }

  $effect(() => {
    const themeId = $themeStore.theme;
    const dark = isDark;
    if (!editorView) return;
    editorView.dispatch({
      effects: themeCompartment.reconfigure(getThemeExtension(themeId, dark))
    });
    syncStickyScrollOffset();
  });

  $effect(() => {
    const ln = settings.effectiveSettings.line_numbers;
    if (!editorView) return;
    editorView.dispatch({
      effects: lineNumbersCompartment.reconfigure(ln ? [lineNumbers(), customFoldGutter, highlightActiveLineGutter()] : [])
    });
  });

  $effect(() => {
    const wrap = settings.effectiveSettings.word_wrap;
    if (!editorView) return;
    editorView.dispatch({
      effects: wordWrapCompartment.reconfigure(wrap ? EditorView.lineWrapping : [])
    });
  });

  $effect(() => {
    const ts = settings.effectiveSettings.tab_size;
    if (!editorView) return;
    editorView.dispatch({
      effects: tabSizeCompartment.reconfigure(EditorState.tabSize.of(ts))
    });
  });

  $effect(() => {
    if (!editorView) return;
    editorView.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly))
    });
  });

  $effect(() => {
    // Reactively (re)create or tear down the minimap. The minimap is a facet
    // value tied to the editor state, so toggling it must RECONFIGURE the
    // compartment — merely flipping `style.display` does nothing when the
    // editor was mounted with the minimap disabled (the compartment is empty).
    if (!editorView) return;
    const enabled = !isLargeFile && $ui.isMinimapEnabled;
    editorView.dispatch({
      effects: minimapCompartment.reconfigure(enabled ? minimapExtension() : []),
    });
  });

  $effect(() => {
    // Reactively reconfigure breadcrumbs when icon_theme or filePath changes.
    settings.effectiveSettings.icon_theme;
    const currentFilePath = filePath;
    const currentRoot = $ui.explorerRoot;
    if (!editorView) return;
    editorView.dispatch({
      effects: breadcrumbsCompartment.reconfigure(breadcrumbs({
        filePath: currentFilePath,
        workspaceRoot: currentRoot || undefined,
        readDirectory: readBreadcrumbDirectory,
        onOpenFile: openFileFromBreadcrumbs,
        showPathHeader: false,
        renderPathIcon: renderBreadcrumbPathIcon,
      }))
    });
    requestAnimationFrame(() => {
      if (editorView) {
        syncBreadcrumbBarIcons(editorView);
        setTimeout(() => {
          if (editorView) syncBreadcrumbBarIcons(editorView);
        }, 50);
      }
    });
  });

  $effect(() => {
    // Lightweight: when a material icon finishes loading, fill it into the bar
    // without reconfiguring the whole plugin (preload bumps this a lot).
    materialIconState.version;
    if (!editorView) return;
    syncBreadcrumbBarIcons(editorView);
  });

  async function loadGitBaseline() {
    if (isLargeFile || !editorView || !$ui.explorerRoot) return;
    const explorerRoot = $ui.explorerRoot;

    // git show HEAD:<path> requires a repo-relative path, not an absolute path.
    const relativePath = filePath.startsWith(explorerRoot)
      ? filePath.slice(explorerRoot.length).replace(/^[\/\\]+/, '')
      : filePath;

    try {
      const baseline = await getGitFileContent(explorerRoot, relativePath, 'HEAD');
      // Check editorView again after async operation - component may have been destroyed
      if (!editorView) return;
      editorView.dispatch({
        effects: gitGutterCompartment.reconfigure([
          gitGutter({
            baseline: baseline ?? content ?? '',
            onStageHunk: (_hunk) => stageFile(explorerRoot, relativePath),
          }),
          keymap.of(gitGutterKeymap),
        ])
      });
    } catch (e) {
      // Ignore error for new files not in HEAD yet
      const msg = String(e);
      if (!msg.includes('exists on disk, but not in') && !msg.includes('not in HEAD')) {
        console.warn('Failed to load git baseline', e);
      }
    }
  }

  $effect(() => {
    // Whenever tabStatus changes (e.g. to saved) or on mount
    tabStatus;
    if (editorView) {
      loadGitBaseline();
    }
  });

  async function handleGoToDefinition() {
    if (!editorView || !$ui.explorerRoot) return;
    const pos = editorView.state.selection.main.head;
    
    let symbol = '';
    const line = editorView.state.doc.lineAt(pos);
    const lineText = line.text;
    const col = pos - line.from;

    let inQuotes = false;
    let quoteChar = '';
    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === "'" || lineText[i] === '"' || lineText[i] === '`') {
            if (!inQuotes) {
                inQuotes = true;
                quoteChar = lineText[i];
                startIdx = i;
            } else if (lineText[i] === quoteChar) {
                if (col > startIdx && col <= i) {
                    endIdx = i;
                    break;
                }
                inQuotes = false;
            }
        }
    }

    if (startIdx !== -1 && endIdx !== -1 && col > startIdx && col <= endIdx) {
        symbol = lineText.substring(startIdx + 1, endIdx);
    } else {
        const word = editorView.state.wordAt(pos);
        if (word) {
            symbol = editorView.state.sliceDoc(word.from, word.to);
        }
    }

    if (!symbol.trim()) return;
    try {
      const { gotoDefinition } = await import('../../utils/symbolEngine');
      const results = await gotoDefinition($ui.explorerRoot, symbol, filePath);
      if (results.length > 0) {
        window.dispatchEvent(new CustomEvent('editor:open-file', {
          detail: { path: results[0].file_path, line: results[0].line }
        }));
      }
    } catch (err) { console.error('Go to definition failed', err); }
  }

  async function handleFindReferences() {
    if (!editorView || !$ui.explorerRoot) return;
    const pos = editorView.state.selection.main.head;
    
    let symbol = '';
    const line = editorView.state.doc.lineAt(pos);
    const lineText = line.text;
    const col = pos - line.from;

    let inQuotes = false;
    let quoteChar = '';
    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === "'" || lineText[i] === '"' || lineText[i] === '`') {
            if (!inQuotes) {
                inQuotes = true;
                quoteChar = lineText[i];
                startIdx = i;
            } else if (lineText[i] === quoteChar) {
                if (col > startIdx && col <= i) {
                    endIdx = i;
                    break;
                }
                inQuotes = false;
            }
        }
    }

    if (startIdx !== -1 && endIdx !== -1 && col > startIdx && col <= endIdx) {
        symbol = lineText.substring(startIdx + 1, endIdx);
    } else {
        const word = editorView.state.wordAt(pos);
        if (word) {
            symbol = editorView.state.sliceDoc(word.from, word.to);
        }
    }

    if (!symbol.trim()) return;
    try {
      const { findReferences } = await import('../../utils/symbolEngine');
      const results = await findReferences($ui.explorerRoot, symbol);
      window.dispatchEvent(new CustomEvent('editor:show-references', {
        detail: { symbol, results }
      }));
    } catch (err) { console.error('Find references failed', err); }
  }

  $effect(() => {
    window.addEventListener('editor:find-references', handleFindReferences);
    return () => window.removeEventListener('editor:find-references', handleFindReferences);
  });

  function handleAction(e: Event) {
    const customEvent = e as CustomEvent;
    if (!editorView) return;
    const action = customEvent.detail?.action;

    if (action === 'undo') undo(editorView);
    else if (action === 'redo') redo(editorView);
    else if (action === 'selectAll') { selectAll(editorView); editorView.focus(); }
    else if (action === 'copyLineUp') copyLineUp(editorView);
    else if (action === 'copyLineDown') copyLineDown(editorView);
    else if (action === 'moveLineUp') moveLineUp(editorView);
    else if (action === 'moveLineDown') moveLineDown(editorView);
    else if (action === 'find') {
      searchMode = 'find';
      uiStore.setFileSearchOpen(true);
      setTimeout(() => searchWidget?.focusInput(), 10);
    }
    else if (action === 'replace') {
      searchMode = 'replace';
      uiStore.setFileSearchOpen(true);
      setTimeout(() => searchWidget?.focusReplaceInput(), 10);
    }
    else if (action === 'replaceAll' && customEvent.detail?.options) {
      // Replace All on the active (live) tab via a single CodeMirror
      // transaction — undoable with Ctrl+Z, and the updateListener keeps
      // the store + autosave in sync.
      const { path: targetPath, options } = customEvent.detail;
      if (currentTab?.path !== targetPath) return;
      const re = buildReplaceRegex(options.query, options);
      const doc = editorView.state.doc.toString();
      const changes: { from: number; to: number; insert: string }[] = [];
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(doc)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        changes.push({ from: m.index, to: m.index + m[0].length, insert: applyReplacement(m[0], re, options) });
      }
      if (changes.length > 0) {
        editorView.dispatch({ changes });
        editorView.focus();
      }
    }
    else if (action === 'goto' && customEvent.detail?.line !== undefined) {
      const lineNum = customEvent.detail.line;
      if (lineNum > 0 && lineNum <= editorView.state.doc.lines) {
        const line = editorView.state.doc.line(lineNum);
        const col = customEvent.detail.column || 1;
        const endCol = customEvent.detail.endColumn || col;
        const anchor = Math.min(line.from + col - 1, line.to);
        const head = Math.min(line.from + endCol - 1, line.to);
        editorView.dispatch({
          selection: { anchor, head },
          scrollIntoView: true,
          // Mark the exact matched span and render its label bar in the viewport
          // so the opened search result stays visible for quick navigation.
          effects: setSearchResultHighlight.of({ from: anchor, to: head })
        });
        if (pendingHighlightTimer) clearTimeout(pendingHighlightTimer);
        pendingHighlightTimer = setTimeout(() => {
          if (editorView) editorView.dispatch({ effects: clearSearchResultHighlight.of(null) });
        }, SEARCH_RESULT_HIGHLIGHT_MS);
        editorView.focus();
      }
    }
  }

  function handleEditorMouseOver() {
    // Left empty as we handle tooltip in markerDOM now
  }

  let style = $derived(`font-size: ${settings.effectiveSettings.font_size}px; font-family: ${settings.effectiveSettings.font_family};`);
  let rightGap = $derived((!isLargeFile && $ui.isMinimapEnabled) ? 150 : 0);

  onMount(() => {
    setupEditor();
    window.addEventListener('editor:action', handleAction);
    window.addEventListener('editor:append-chunk', handleAppendChunk);
    window.addEventListener('editor:sync-content', handleSyncContent);
  });

  /**
   * External content sync (disk watcher reload, file re-open). Applies a
   * freshly-read file content to the LIVE CodeMirror buffer without tearing
   * down the view. The event fires BEFORE the store update (see
   * editorStore.setInitialContent) so we can compare against the pre-update
   * baseline: if the buffer has diverged from it, the user is typing inside
   * the extraction debounce window and we must NOT clobber their edits.
   */
  function handleSyncContent(e: any) {
    if (!editorView) return;
    const { tabId: tId, content: newContent } = e.detail ?? {};
    if (tId !== currentTabId || typeof newContent !== 'string') return;
    if (editorView.state.doc.toString() === newContent) return;
    const tab = editorStore.getTabsSnapshot().find((t: any) => t.id === currentTabId);
    if (tab?.isModified) return;
    // Baseline check: the pre-update doc must still match the tab's baseline
    // or the new content itself (fresh open) — anything else means in-flight
    // user edits.
    if (tab && tab.originalContent !== null
        && editorView.state.doc.toString() !== tab.originalContent
        && tab.content !== editorView.state.doc.toString()) return;
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: newContent }
    });
  }
  
  function handleAppendChunk(e: any) {
      if (!editorView) return;
      const { tabId: tId, chunk } = e.detail;
      let state = editorStates.get(tId);
      if (state) {
          if (tId === currentTabId) {
              editorView.dispatch({
                  changes: { from: editorView.state.doc.length, insert: chunk }
              });
              editorStates.set(tId, editorView.state);
          } else {
              const tr = state.update({
                  changes: { from: state.doc.length, insert: chunk }
              });
              editorStates.set(tId, tr.state);
          }
      } else {
          // Store chunk so when we create state we have it. The file is still
          // being loaded (not edited), so use setInitialContent — updateContent
          // would wrongly mark a freshly-opened file as modified (unsaved dot).
          const tabData = editorStore.getTabsSnapshot().find(t => t.id === tId);
          if (tabData) {
               editorStore.setInitialContent(tId, (tabData.content || '') + chunk);
          }
      }
  }
  
  (() => {
      // Re-run setupEditor when tabId changes
      if (tabId && tabId !== currentTabId && editorView) {
          setupEditor();
      }
  });

  onDestroy(() => {
    if (pendingHighlightTimer) {
      clearTimeout(pendingHighlightTimer);
      pendingHighlightTimer = null;
    }
    disposeBreadcrumbObserver();
    window.removeEventListener('editor:action', handleAction);
    window.removeEventListener('editor:append-chunk', handleAppendChunk);
    window.removeEventListener('editor:sync-content', handleSyncContent);
    // Instead of just current tab, save history for all tracked states
    if (editorView) {
      if (!isHeaderOnly) {
        for (const [id, state] of editorStates.entries()) {
          const t = editorStore.getTabsSnapshot().find(tb => tb.id === id);
          const isL = t?.isLargeFile || (state.doc.length > 250000);
          if (!isL) {
             try {
                const serializedHistory = state.toJSON({ history: historyField }).history;
                if (serializedHistory) {
                  editorStore.updateUndoHistory(id, serializedHistory);
                }
             } catch(e) {}
          }
          editorStore.updateContent(id, state.doc.toString());
        }
        if (currentTabId) {
            const pos = editorView.state.selection.main.head;
            const line = editorView.state.doc.lineAt(pos);
            editorStore.updateCursor(currentTabId, line.number, pos - line.from + 1);
            editorStore.updateScroll(currentTabId, editorView.scrollDOM.scrollTop, editorView.scrollDOM.scrollLeft);
        }
      }
      editorView.destroy();
      editorView = null;
    }
    
    // Clean up all fold markers on destroy
    for (const item of foldMarkers) {
      unmount(item.app);
    }
    foldMarkers.clear();
  });

  let editorContextMenuItems: MenuItem[] = $derived([
    {
      id: 'goto-definition',
      label: 'Go to Definition',
      shortcut: 'F12',
      action: () => handleGoToDefinition(),
      disabled: isLargeFile || currentTab?.language === 'plaintext'
    },
    {
      id: 'goto-type-definition',
      label: 'Go to Type Definition',
      action: () => { /* Not yet natively supported by backend symbol engine */ },
      disabled: true
    },
    {
      id: 'goto-implementations',
      label: 'Go to Implementations',
      action: () => { /* Not yet natively supported by backend symbol engine */ },
      disabled: true
    },
    {
      id: 'find-references',
      label: 'Find All References',
      shortcut: 'Shift+F12',
      action: () => handleFindReferences(),
      disabled: isLargeFile || currentTab?.language === 'plaintext'
    },
    {
      id: 'find-implementations',
      label: 'Find All Implementations',
      action: () => { /* Not yet natively supported by backend symbol engine */ },
      disabled: true
    },
    {
      id: 'show-call-hierarchy',
      label: 'Show Call Hierarchy',
      action: () => { /* Not yet natively supported by backend symbol engine */ },
      disabled: true
    },
    { id: 'sep1', label: '', action: () => {}, separator: true },
    {
      id: 'cut',
      label: 'Cut',
      shortcut: 'Ctrl+X',
      action: () => document.execCommand('cut')
    },
    {
      id: 'copy',
      label: 'Copy',
      shortcut: 'Ctrl+C',
      action: () => document.execCommand('copy')
    },
    {
      id: 'paste',
      label: 'Paste',
      shortcut: 'Ctrl+V',
      action: () => document.execCommand('paste')
    },
    { id: 'sep2', label: '', action: () => {}, separator: true },
    {
      id: 'command-palette',
      label: 'Command Palette',
      shortcut: 'Ctrl+Shift+P',
      action: () => {
        window.dispatchEvent(new CustomEvent('open-command-palette'));
      }
    }
  ]);
</script>

<ContextMenu items={editorContextMenuItems}>
<div class="absolute inset-0 [&_.cm-editor]:h-full editor-wrapper flex flex-col" style={style} role="none" onmouseover={handleEditorMouseOver} onfocus={() => {}}>

  {#if isLargeFile}
    <div class="absolute top-0 left-0 right-0 text-[10px] px-3 py-1 text-center z-10" style="background-color: color-mix(in srgb, var(--color-warning) 20%, transparent); color: var(--color-warning);">
      Large file — syntax highlighting and some features disabled for performance
    </div>
  {/if}
  {#if tabStatus === 'deleted'}
    <div class="absolute top-0 left-0 right-0 text-xs px-3 py-2 text-center z-10 flex justify-center items-center gap-4" style="background-color: color-mix(in srgb, var(--color-error) 20%, transparent); color: var(--color-error);">
      <span>This file has been deleted from disk.</span>
      <button class="px-3 py-1 rounded cursor-pointer" style="background-color: color-mix(in srgb, var(--color-error) 50%, transparent);" onclick={() => editorStore.closeTab(tabId)}>Close Tab</button>
    </div>
  {:else if tabStatus === 'conflict'}
    <div class="absolute top-0 left-0 right-0 text-xs px-3 py-2 text-center z-10 flex justify-center items-center gap-4" style="background-color: color-mix(in srgb, var(--color-warning) 20%, transparent); color: var(--color-warning);">
      <span>This file has been modified by another program. You have unsaved changes.</span>
      <button class="px-3 py-1 rounded cursor-pointer" style="background-color: color-mix(in srgb, var(--color-warning) 50%, transparent);" onclick={() => editorStore.markSaved(tabId)}>Ignore</button>
      <button class="bg-surface-3 hover:bg-surface-4 px-3 py-1 rounded cursor-pointer" onclick={() => {
        if (!currentTab) return;
        invoke('read_file_text', { path: currentTab.path }).then((content) => {
          editorStore.setInitialContent(tabId, content as string);
        }).catch(async (err) => {
          if (String(err) === '__LARGE_FILE__') {
            try {
              const chunked = await invoke<any>('read_file_chunked', { path: currentTab.path });
              editorStore.setInitialContent(tabId, chunked.content);
              editorStore.updateTab(tabId, { isLargeFile: true, isPreview: true });
            } catch(e) {}
          }
        });
      }}>Reload from Disk</button>
    </div>
  {/if}
  <div class="relative w-full pointer-events-none" style="height: 0; z-index: 100;">
    {#if topRightOverlay}
      <div class="absolute right-2 h-[28px] flex items-center pointer-events-auto" style="top: {tabStatus === 'deleted' || tabStatus === 'conflict' ? '32px' : '0px'};">
        {@render topRightOverlay()}
      </div>
    {/if}
  </div>
  <div bind:this={editorEl} class="{hideContent ? 'flex-none' : 'h-full flex-1'} relative editor-container {tabStatus === 'deleted' || tabStatus === 'conflict' ? 'pt-8' : ''} {iconThemeClass} {hideContent ? 'hide-cm-content' : ''} {isHeaderOnly ? 'z-20' : 'z-10'}">
  </div>
  
  {#if children}
    <div class="flex-1 relative overflow-hidden">
      {@render children()}
    </div>
  {/if}

  {#if scrollDOM && !isHeaderOnly}
    <HorizontalScrollbar target={scrollDOM} leftGap={gutterWidth} rightGap={rightGap} />
  {/if}
    
  {#if $uiStore.isFileSearchOpen}
    <EditorSearchWidget 
      bind:this={searchWidget} 
      {editorView} 
      onDocChanged={docChangedCount} 
      {rightGap}
      mode={searchMode}
    />
  {/if}
</div>
</ContextMenu>

<style>
  :global(.hide-cm-content .cm-scroller) {
    position: absolute !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 1px !important;
    width: 1px !important;
    overflow: hidden !important;
  }
  :global(.hide-cm-content .cm-editor) {
    height: auto !important;
    overflow: visible !important;
  }
</style>

