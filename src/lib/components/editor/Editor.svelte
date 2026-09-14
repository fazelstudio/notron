<!--
 * Editor
 *
 * CodeMirror 6 editor instance with theme, minimap, git gutter, and search support.
-->

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
  import { settingsStore } from '../../stores/settings.svelte';
  import { theming } from 'notron-sdk';
  import { getIconProvider } from '../../icon-theme/registry';
  import HorizontalScrollbar from '../common/HorizontalScrollbar.svelte';
  import EditorSearchWidget from './EditorSearchWidget.svelte';
  import EditorFoldMarker from '../common/EditorFoldMarker.svelte';
  import GitGutterPeekButton from '../common/GitGutterPeekButton.svelte';
  import ContextMenu, { type MenuItem } from '../common/ContextMenu.svelte';
  import { getThemeExtension } from '../../theme/registry';
  import { ntEditorOverride } from '../../theme/cm6-theme';
  import { showMinimap } from '@replit/codemirror-minimap';
  import { overviewRuler, overviewRulerMarkers } from '@fazelstudio/codemirror-overview-ruler';
  import { editorStore } from '../../stores/editor';
  import { buildReplaceRegex, applyReplacement } from '../../utils/replace';
  import { uiStore } from '../../stores/ui';
  import { themeStore } from '../../stores/theme';
  import { getGitFileContent, stageFile } from '../../services/git';

  // Local breadcrumb icon renderer via SDK icon provider (decoupled from extension import).
  function renderBreadcrumbPathIcon(entry: { name: string; isDir: boolean }, _expanded: boolean): string | null {
    try {
      const theme = settingsStore.effectiveSettings.icon_theme;
      if (theme === 'off') return `<span style="display:none"></span>`;
      const provider: any = getIconProvider(theme);
      if (provider?.getFileIconSvg) {
        const svg = entry.isDir
          ? (provider.getFolderIconSvg?.(entry.name, 14, _expanded) ?? provider.getFileIconSvg?.(entry.name, 14) ?? '')
          : (provider.getFileIconSvg?.(entry.name, 14) ?? '');
        if (svg) {
          const wrapper = 'width:14px;height:14px;display:inline-block;vertical-align:-2px;';
          return `<span class="cm-breadcrumbs-icon" style="${wrapper}">${svg}</span>`;
        }
      }
    } catch {}
    if (entry.isDir) return null;
    return null;
  }
  import { LARGE_FILE_THRESHOLD_BYTES, SEARCH_RESULT_HIGHLIGHT_MS, MINIMAP_WIDTH, EDITOR_SCROLLBAR_WIDTH } from '../../constants';
  import { editorExtensionRegistry } from '../../editor/extensionRegistry';
  import { contextMenuRegistry } from '../../workbench/contextMenuRegistry';
  import { eventBus } from '../../utils/eventBus';
  // Ensure editor extensions are registered via the central registry (modular)
  void editorExtensionRegistry;

  let {
    tabId,
    content,
    filePath,
    children,
    topRightOverlay,
    hideContent = false,
    isHeaderOnly = false,
    readOnly = false,
    headerSeparator = false,
    loadingIndicator = true,
  }: {
    tabId: string;
    content: string;
    filePath: string;
    children?: Snippet;
    topRightOverlay?: Snippet;
    hideContent?: boolean;
    isHeaderOnly?: boolean;
    readOnly?: boolean;
    headerSeparator?: boolean;
    loadingIndicator?: boolean;
  } = $props();

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
  let previewLoading = $state(false);

  const tabsStore = editorStore.tabs;
  let currentTab = $derived($tabsStore.find((t: any) => t.id === tabId));
  let tabStatus = $derived(currentTab?.status);
  let isLargeFile = $derived(currentTab?.isLargeFile || (content && content.length > LARGE_FILE_THRESHOLD_BYTES));
  let showLoadingBar = $derived(loadingIndicator && Boolean(currentTab?.isLoading || previewLoading));

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

  // The git gutter peek view renders toolbar buttons with the native title attribute.
  // This plugin replaces those with the app's Tooltip component by wrapping each button.
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
  const stickyScrollCompartment = new Compartment();
  const overviewRulerCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();

  // Builds the minimap extensions, or an empty array when disabled.
  function minimapExtension(): Extension[] {
    return [
      showMinimap.compute([hunksField, baselineContentFacet], (state) => {
        let gitGutterRecord: Record<number, string> = {};

        try {
          const baseline = state.facet(baselineContentFacet);
          const hunks = baseline ? (state.field(hunksField, false) ?? []) : [];
          for (const hunk of hunks) {
            let color = 'var(--color-success)';
            if (hunk.type === 'modified') color = 'var(--color-info)';
            else if (hunk.type === 'deleted') color = 'var(--color-error)';
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
            // AFTER this create() returns, so the move must happen after that
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
  let loadingBarTop = $derived(hideContent ? '28px' : ($ui.isBreadcrumbsEnabled ? '28px' : '0px'));
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
    return import('../../platform/ipc').then(({ fileIpc }) => fileIpc.readDirectoryFlat(dir, false)).then(
      (node) =>
        (node || []).map((item: any) => ({
          name: item.name,
          path: item.path,
          isDir: item.is_dir,
          hasChildren: !!item.has_children,
        })),
    );
  }

  // The breadcrumb panel is a sticky top panel while stickyscroll pins its bar at absolute top.
  // Measure the panel and offset the sticky bar below it; the plugin never rewrites top again.
  let minimapResizeObserver: ResizeObserver | null = null;
  let observedMinimapEl: HTMLElement | null = null;

  // The minimap writes its own inline width, overriding CSS. Size the sticky bar from the real
  // measured edge and watch for resize changes to resync automatically.
  function trackMinimapResizes(el: HTMLElement) {
    if (typeof ResizeObserver === 'undefined') return;
    if (observedMinimapEl === el) return;
    minimapResizeObserver?.disconnect();
    observedMinimapEl = el;
    minimapResizeObserver = new ResizeObserver(() => syncStickyScrollOffset());
    minimapResizeObserver.observe(el);
  }

  function syncStickyScrollOffset() {
    if (!editorView) return;

 // Content right inset (text wrap edge + active-line band)
    // Measure the minimap's true geometry. Runs even when the sticky bar is
    // absent, so content alignment never depends on the sticky setting.
    const minimap = editorView.dom.querySelector<HTMLElement>('.cm-minimap-container');
    let rightInsetPx = EDITOR_SCROLLBAR_WIDTH;
    let contentGapPx = '0px';
    if (minimap && minimap.offsetWidth > 0) {
      const editorRect = editorView.dom.getBoundingClientRect();
      const inset = Math.round(editorRect.right - minimap.getBoundingClientRect().left);
      if (inset > rightInsetPx) rightInsetPx = inset;
      trackMinimapResizes(minimap);
      // Margin for .cm-content so text AND the active-line band end exactly on
      // the minimap border. Measured against the SCROLLER's clientWidth so the
      // vertical scrollbar presence is already factored in.
      const mapOffset = Math.round(minimap.getBoundingClientRect().left - editorRect.left);
      const scrollerWidth = editorView.scrollDOM.clientWidth;
      if (scrollerWidth > mapOffset) contentGapPx = `${scrollerWidth - mapOffset}px`;
    } else {
      minimapResizeObserver?.disconnect();
      observedMinimapEl = null;
    }
    // Consumed by app.css: .cm-content { margin-right: var(--notron-minimap-gap) }
    editorView.dom.style.setProperty('--notron-minimap-gap', contentGapPx);

    const sticky = editorView.dom.querySelector<HTMLElement>('.cm-stickyscroll-container');
    if (!sticky) return;
    // When breadcrumbs are disabled, .cm-panels-top is absent — reset top to 0.
    // When breadcrumbs are enabled, offset sticky scroll below the panel.
    const panels = editorView.dom.querySelector<HTMLElement>('.cm-panels.cm-panels-top');
    sticky.style.top = panels ? `${panels.offsetHeight}px` : '0px';

    // Sticky bar ends exactly where the minimap begins (or the scrollbar),
    // matching the content's alignment in both cases.
    sticky.style.setProperty('width', `calc(100% - ${rightInsetPx}px)`, 'important');
    sticky.style.setProperty('right', 'auto', 'important');
  }

  function openFileFromBreadcrumbs(path: string) {
    eventBus.emit('request-open-file', { path });
  }

  function setupEditor() {
    if (!editorView) {
        editorView = new EditorView({ parent: editorEl });
        scrollDOM = editorView!.scrollDOM;
    }
    
    // Save old state — always save the live editor view state for the
    // current tab, not just when the Map already has an entry (the Map
    // may be empty in single-tab sessions or after rapid view-mode switches).
    if (currentTabId && editorView) {
        editorStates.set(currentTabId, editorView.state);
    }
    currentTabId = tabId;

    let cursorScrollTimeout: ReturnType<typeof setTimeout> | null = null;

    // CodeMirror manages its own internal state (immutable document tree).
    // Svelte only needs the content at specific moments (see 4.2).
    let contentExtractTimer: ReturnType<typeof setTimeout> | null = null;
    const CONTENT_DEBOUNCE_MS = 500;

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        docChangedCount++;
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
    // Bridge for git gutter to overview ruler.
    const gitRulerBridge = overviewRulerMarkers.compute([hunksField], (state) => {
      const hunks = state.field(hunksField, false) ?? [];
      const doc = state.doc;
      const markers: any[] = [];
      
      for (const hunk of hunks) {
        try {
          // hunk.fromB and toB are line numbers in the current document.
          const fromLine = doc.line(Math.max(1, Math.min(hunk.fromB, doc.lines)));
          const toLine = doc.line(Math.max(1, Math.min(hunk.toB, doc.lines)));
          
          let type = 'info';
          if (hunk.type === 'added') type = 'info'; // New line
          if (hunk.type === 'modified') type = 'warning'; // Modified line
          if (hunk.type === 'deleted') type = 'error'; // Deleted line
          
          markers.push({ from: fromLine.from, to: toLine.to, type });
        } catch (e) {
          // Ignore out-of-range lines.
        }
      }
      return markers;
    });


    let extBase = [
      ...(isLargeFile ? COMMON_EXTENSIONS_LARGE_FILE : COMMON_EXTENSIONS),
      stickyScrollCompartment.of(!isHeaderOnly && !isLargeFile && !filePath.toLowerCase().endsWith('.svg') && $ui.isStickyScrollEnabled ? stickyScroll() : []),
      breadcrumbsCompartment.of($ui.isBreadcrumbsEnabled ? breadcrumbs({
        filePath,
        workspaceRoot: $ui.explorerRoot || undefined,
        readDirectory: readBreadcrumbDirectory,
        onOpenFile: openFileFromBreadcrumbs,
        showPathHeader: false,
        renderPathIcon: renderBreadcrumbPathIcon,
      }) : []),
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
      themeCompartment.of([getThemeExtension($themeStore.theme, isDark), ntEditorOverride]),
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
      overviewRulerCompartment.of([
        overviewRuler({ position: 'right', width: 10 }),
        gitRulerBridge
      ]),
      minimapCompartment.of(!isHeaderOnly && !isLargeFile && $ui.isMinimapEnabled ? minimapExtension() : []),
      readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
      searchResultHighlightExtensions(),
    ];

    let state = editorStates.get(tabId);
    if (!state) {
        const tabsSnap = editorStore.getTabsSnapshot();
        const tabData = tabsSnap.find(t => t.id === tabId)
          ?? tabsSnap.find(t => t.path === filePath && t.language !== 'markdown-preview')
          ?? tabsSnap.find(t => t.path === filePath);
        // Prefer a non-empty store buffer over a stale/empty prop — nested
        // markdown editors can mount with a briefly empty split-store copy.
        const storeDoc = typeof tabData?.content === 'string' ? tabData.content : null;
        const initialDoc =
          (typeof content === 'string' && content.length > 0)
            ? content
            : (storeDoc && storeDoc.length > 0)
              ? storeDoc
              : (content || '');
        if (tabData && tabData.undoHistory && !isLargeFile) {
          try {
            state = EditorState.fromJSON(
              { doc: initialDoc, history: tabData.undoHistory },
              { extensions: extBase },
              { history: historyField }
            );
          } catch (e) {
            console.warn('Failed to restore history', e);
            state = EditorState.create({ doc: initialDoc, extensions: extBase });
          }
        } else {
          state = EditorState.create({ doc: initialDoc, extensions: extBase });
        }
        editorStates.set(tabId, state);
    } else if (!isHeaderOnly && state.doc.length === 0) {
        // Cached empty state from a prior mount-before-load — rebuild from store/prop.
        const tabsSnap = editorStore.getTabsSnapshot();
        const tabData = tabsSnap.find(t => t.id === tabId)
          ?? tabsSnap.find(t => t.path === filePath);
        const healDoc =
          (typeof content === 'string' && content.length > 0)
            ? content
            : (typeof tabData?.content === 'string' && tabData.content.length > 0)
              ? tabData.content
              : '';
        if (healDoc.length > 0) {
          state = EditorState.create({ doc: healDoc, extensions: extBase });
          editorStates.set(tabId, state);
        }
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
      effects: themeCompartment.reconfigure([getThemeExtension(themeId, dark), ntEditorOverride])
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
    const enabled = !isHeaderOnly && !isLargeFile && $ui.isMinimapEnabled;
    editorView.dispatch({
      effects: minimapCompartment.reconfigure(enabled ? minimapExtension() : []),
    });
    // Defer to next paint to let the minimap DOM update first
    requestAnimationFrame(() => syncStickyScrollOffset());
  });

  $effect(() => {
    // Reactively reconfigure breadcrumbs when icon_theme, filePath, or isBreadcrumbsEnabled changes.
    settings.effectiveSettings.icon_theme;
    const currentFilePath = filePath;
    const currentRoot = $ui.explorerRoot;
    const breadcrumbsEnabled = $ui.isBreadcrumbsEnabled;
    if (!editorView) return;
    editorView.dispatch({
      effects: breadcrumbsCompartment.reconfigure(breadcrumbsEnabled ? breadcrumbs({
        filePath: currentFilePath,
        workspaceRoot: currentRoot || undefined,
        readDirectory: readBreadcrumbDirectory,
        onOpenFile: openFileFromBreadcrumbs,
        showPathHeader: false,
        renderPathIcon: renderBreadcrumbPathIcon,
      }) : [])
    });
    // Defer to next paint — CodeMirror flushes DOM changes asynchronously, so
    // .cm-panels-top may still be in the DOM immediately after dispatch().
    // requestAnimationFrame guarantees the panel is added/removed before we measure.
    requestAnimationFrame(() => {
      if (!editorView) return;
      syncStickyScrollOffset();
      if (breadcrumbsEnabled) {
        syncBreadcrumbBarIcons(editorView);
        setTimeout(() => {
          if (editorView) syncBreadcrumbBarIcons(editorView);
        }, 50);
      }
    });
  });

  $effect(() => {
    const enabled = !isHeaderOnly && !isLargeFile && !filePath.toLowerCase().endsWith('.svg') && $ui.isStickyScrollEnabled;
    if (!editorView) return;
    editorView.dispatch({
      effects: stickyScrollCompartment.reconfigure(enabled ? stickyScroll() : []),
    });
    // Defer so the stickyscroll plugin has mounted/unmounted its DOM before we sync.
    requestAnimationFrame(() => syncStickyScrollOffset());
  });

  $effect(() => {
    // When the color theme flips (light/dark variant may change material icons),
    // re-sync breadcrumb icons via SDK theming event — no direct extension import.
    let cleanup: (() => void) | null = null;
    try {
      const disp = theming.onDidChangeActiveColorTheme(() => {
        if (editorView) syncBreadcrumbBarIcons(editorView);
      });
      cleanup = () => disp.dispose();
    } catch {}
    return () => { try { cleanup?.(); } catch {} };
  });

  // Also re-sync when icon_theme setting changes (material vs default) — already
  // covered by breadcrumbs compartment reconfigure, but sync again for safety.
  $effect(() => {
    void settingsStore.effectiveSettings.icon_theme;
    if (!editorView) return;
    syncBreadcrumbBarIcons(editorView);
  });

  async function loadGitBaseline() {
    // Skip git gutter for large files (performance)
    if (isLargeFile || !editorView || !$ui.explorerRoot) return;
    // Empty doc + full HEAD baseline paints the whole file as "deleted". That
    // happens when the code editor mounts before the buffer is hydrated
    // (preview↔text toggle). Wait until we have text, then diff for real.
    if (editorView.state.doc.length === 0) {
      editorView.dispatch({
        effects: gitGutterCompartment.reconfigure([
          gitGutter({
            baseline: '',
            onStageHunk: () => {},
          }),
          keymap.of(gitGutterKeymap),
        ])
      });
      return;
    }
    const explorerRoot = $ui.explorerRoot;

    // git show HEAD:<path> requires a repo-relative path, not an absolute path.
    const relativePath = filePath.startsWith(explorerRoot)
      ? filePath.slice(explorerRoot.length).replace(/^[\/\\]+/, '')
      : filePath;

    try {
      const baseline = await getGitFileContent(explorerRoot, relativePath, 'HEAD');
      // Check editorView again after async operation - component may have been destroyed
      if (!editorView) return;
      // Content may have arrived while we awaited — if still empty, keep neutral.
      if (editorView.state.doc.length === 0) return;

      if (baseline === null) {
        // File is not in HEAD: it's new, gitignored, or untracked.
        // Keep the gutter mounted with the file's own content as baseline:
        // zero diff means no markers are drawn, but the spacer still reserves
        // the column width so tracked and untracked files lay out identically
        // (no horizontal shift shortly after opening an ignored file).
        editorView.dispatch({
          effects: gitGutterCompartment.reconfigure([
            gitGutter({
              baseline: editorView.state.doc.toString(),
              onStageHunk: () => {},
            }),
            keymap.of(gitGutterKeymap),
          ])
        });
        return;
      }

      editorView.dispatch({
        effects: gitGutterCompartment.reconfigure([
          gitGutter({
            baseline,
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
    tabStatus;
    // Re-run when the buffer prop/store hydrates after an empty mount.
    content;
    currentTab?.content;
    if (editorView) {
      loadGitBaseline();
    }
  });

  // Heal an empty CodeMirror doc from the store/prop. Nested markdown editors
  // can mount with "" while MarkdownPreview already shows the real buffer
  // (lookup by path). Without this, text/split mode stays blank and the git
  // gutter paints the whole file as deleted vs HEAD.
  $effect(() => {
    if (isHeaderOnly || !editorView) return;
    const propContent = content;
    const tabsSnap = $tabsStore;
    const tabData =
      tabsSnap.find((t: any) => t.id === tabId) ??
      tabsSnap.find((t: any) => t.path === filePath && t.language !== 'markdown-preview') ??
      tabsSnap.find((t: any) => t.path === filePath);
    const desired =
      typeof propContent === 'string' && propContent.length > 0
        ? propContent
        : typeof tabData?.content === 'string' && tabData.content.length > 0
          ? tabData.content
          : '';
    if (!desired) return;
    const doc = editorView.state.doc.toString();
    if (doc === desired) return;
    if (doc.length > 0) return; // Never clobber a non-empty buffer here
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: desired },
    });
    if (currentTabId) editorStates.set(currentTabId, editorView.state);
    loadGitBaseline();
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
        eventBus.emit('request-open-file', { path: results[0].file_path, line: results[0].line });
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
  // rightGap = space reserved to the right of the horizontal scrollbar thumb
  // so it doesn't overlap the minimap or the vertical scrollbar track.
  let rightGap = $derived((!isLargeFile && $ui.isMinimapEnabled) ? MINIMAP_WIDTH + EDITOR_SCROLLBAR_WIDTH : EDITOR_SCROLLBAR_WIDTH);

  onMount(() => {
    setupEditor();
    window.addEventListener('editor:action', handleAction);
    window.addEventListener('editor:append-chunk', handleAppendChunk);
    const stopPreviewLoading = eventBus.on('editor:preview-loading', ({ path, loading }) => {
      if (isHeaderOnly && path === filePath) previewLoading = loading;
    });
    // Header-only shells share the same tabId as the nested code editor; if
    // they also listened for sync-content they could race and blank the buffer.
    if (!isHeaderOnly) {
      window.addEventListener('editor:sync-content', handleSyncContent);
    }

    return stopPreviewLoading;
  });

  // Keep one CodeMirror view alive while the pane switches tabs. The tab's
  // state is swapped in place, so breadcrumbs, gutters and scroll chrome do
  // not disappear and re-mount between editor selections.
  $effect(() => {
    tabId;
    if (editorView && tabId !== currentTabId) {
      setupEditor();
    }
  });

  // Sync freshly read file content to the live CodeMirror buffer without tearing down the view.
  // The event fires before the store update so we can compare against the baseline and avoid
  // clobbering in-flight edits.
  function handleSyncContent(e: any) {
    if (!editorView || isHeaderOnly) return;
    const { tabId: tId, content: newContent } = e.detail ?? {};
    if (tId !== currentTabId || typeof newContent !== 'string') return;
    if (editorView.state.doc.toString() === newContent) return;
    const tab = editorStore.getTabsSnapshot().find((t: any) => t.id === currentTabId);
    if (tab?.isModified) return;
    // Allow sync when the editor doc is empty (fresh open or after view-mode
    // switch).  The baseline check below is meant to avoid clobbering in-flight
    // user edits, but after setInitialContent the store is already updated so
    // originalContent === tab.content === newContent, making the old check skip
    // the sync and leave the editor blank.
    if (editorView.state.doc.length > 0
        && tab && tab.originalContent !== null
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
  
  onDestroy(() => {
    if (pendingHighlightTimer) {
      clearTimeout(pendingHighlightTimer);
      pendingHighlightTimer = null;
    }
    disposeBreadcrumbObserver();
    minimapResizeObserver?.disconnect();
    minimapResizeObserver = null;
    observedMinimapEl = null;
    window.removeEventListener('editor:action', handleAction);
    window.removeEventListener('editor:append-chunk', handleAppendChunk);
    if (!isHeaderOnly) {
      window.removeEventListener('editor:sync-content', handleSyncContent);
    }
    if (editorView) {
      if (!isHeaderOnly) {
        // Save the LIVE editor state for the current tab first — the Map may be
        // stale or empty (single-tab session, rapid view-mode switches) and the
        // 500ms contentExtractTimer may not have fired before destruction.
        if (currentTabId) {
          editorStates.set(currentTabId, editorView.state);
        }
        // Save undo history for ALL tracked tabs (shared Map) so it persists
        // across view-mode switches, but only sync CONTENT for the CURRENT tab
        // to avoid overwriting correct store content with stale cached states.
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
        }
        // Sync content only for the current tab — other tabs' content is kept
        // up-to-date by the debounced contentExtractTimer during editing.
        // Never push an empty doc over a non-empty store buffer: that is what
        // wiped PRD.md (and other markdown) when switching preview → code →
        // preview with a still-loading or briefly-empty CodeMirror instance.
        if (currentTabId) {
          const docContent = editorView.state.doc.toString();
          const tabsSnap = editorStore.getTabsSnapshot();
          const storeTab =
            tabsSnap.find((tb) => tb.id === currentTabId) ??
            tabsSnap.find((tb) => tb.path === filePath);
          const storeContent = storeTab?.content;
          const wouldWipe =
            docContent.length === 0 &&
            typeof storeContent === 'string' &&
            storeContent.length > 0;
          if (!wouldWipe) {
            editorStore.updateContent(currentTabId, docContent);
          }
            const pos = editorView.state.selection.main.head;
            const line = editorView.state.doc.lineAt(pos);
            editorStore.updateCursor(currentTabId, line.number, pos - line.from + 1);
            editorStore.updateScroll(currentTabId, editorView.scrollDOM.scrollTop, editorView.scrollDOM.scrollLeft);
        }
      }
      editorView.destroy();
      editorView = null;
    }
    
    for (const item of foldMarkers) {
      unmount(item.app);
    }
    foldMarkers.clear();
  });

  // Editor context menu is registry-driven (contrib/editor/contribution.ts).
  // `currentTab` is read so disabled predicates re-evaluate on tab switch.
  let editorContextMenuItems: MenuItem[] = $derived.by(() => {
    void currentTab?.id;
    return contextMenuRegistry.getMenuItems('editor/context') as MenuItem[];
  });
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
      <button class="nt-control" style="background-color: color-mix(in srgb, var(--color-error) 50%, transparent);" onclick={() => editorStore.closeTab(tabId)}>Close Tab</button>
    </div>
  {:else if tabStatus === 'conflict'}
    <div class="absolute top-0 left-0 right-0 text-xs px-3 py-2 text-center z-10 flex justify-center items-center gap-4" style="background-color: color-mix(in srgb, var(--color-warning) 20%, transparent); color: var(--color-warning);">
      <span>This file has been modified by another program. You have unsaved changes.</span>
      <button class="nt-control" style="background-color: color-mix(in srgb, var(--color-warning) 50%, transparent);" onclick={() => editorStore.markSaved(tabId)}>Ignore</button>
      <button class="nt-control bg-surface-3 hover:bg-surface-4" onclick={() => {
        if (!currentTab) return;
        import('../../platform/ipc').then(({ fileIpc }) => fileIpc.readText(currentTab.path).then((content) => {
          editorStore.setInitialContent(tabId, content as string);
        }).catch(async (err) => {
          if (String(err) === '__LARGE_FILE__') {
            try {
              const chunked = await fileIpc.readChunked(currentTab.path);
              editorStore.setInitialContent(tabId, chunked.content);
              editorStore.updateTab(tabId, { isLargeFile: true, isPreview: true });
            } catch(e) {}
          }
        }));
      
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
  {#if showLoadingBar}
    <div
      class="editor-loading-bar"
      style="top: {loadingBarTop};"
      aria-hidden="true"
    ></div>
  {/if}
  <div bind:this={editorEl} class="{hideContent ? 'flex-none h-7' : 'h-full flex-1'} relative editor-container {tabStatus === 'deleted' || tabStatus === 'conflict' ? 'pt-8' : ''} {iconThemeClass} {hideContent ? 'hide-cm-content' : ''} {headerSeparator ? 'header-separator' : ''} {isHeaderOnly ? 'z-20' : 'z-10'}">
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
    height: 28px !important;
    min-height: 28px !important;
    overflow: visible !important;
  }
  :global(.hide-cm-content .cm-panels-top) {
    display: block !important;
    height: 28px !important;
  }
  :global(.header-separator) {
    border-bottom: 1px solid var(--nt-editor-border);
  }

  .editor-loading-bar {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    overflow: hidden;
    pointer-events: none;
    z-index: 30;
    background: transparent;
  }

  .editor-loading-bar::after {
    position: absolute;
    top: 0;
    right: -35%;
    width: 35%;
    height: 100%;
    content: '';
    background: var(--nt-focus-border);
    box-shadow: 0 0 6px color-mix(in srgb, var(--nt-focus-border) 65%, transparent);
    animation: editor-loading-sweep 1.15s linear infinite;
  }

  @keyframes editor-loading-sweep {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(-385%);
    }
  }
</style>
