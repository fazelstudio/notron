<script lang="ts">
  import { uiStore } from '../../stores/ui';
  import { sourceControlStore } from '../../stores/sourceControl';
  import { buildChangeTree } from '../../utils/gitChangeTree';
  import type { ChangeTreeNode } from '../../utils/gitChangeTree';
  import { editorStore } from '../../stores/editor';
  import { splitStore } from '../../stores/split';
  import { terminalStore } from '../../stores/terminal';
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';
  import { gitRepoStore } from '../../stores/gitRepo';
  import type { GitFileStatus } from '../../services/git';
  import { Plus, Minus, RefreshCw, Upload, Download, Loader2, FileText, ChevronDown, ChevronRight, GitBranch, MoreHorizontal, Target, Cloud, Undo2, Settings, X, Check, Copy, Folder, FolderOpen } from 'lucide-svelte';
  import Tooltip from '../common/Tooltip.svelte';
  import { getFileIcon } from '../../extensions/material-icons/fileIcons';
  import { getGitStatusStyle, getExpandedFileStatusStyle } from '../../utils/gitStatusStyles';
  import MaterialIcon from '../../extensions/material-icons/MaterialIcon.svelte';
  import { settingsStore } from '../../stores/settings.svelte';

  const ui = uiStore;

  let isCommitting = $state(false);
  let commitMessage = $state('');

  // Manual git path UI
  let showManualPath = $state(false);
  let manualPathInput = $state('');

  // Split view states
  let changesVisible = $state(true);
  let graphVisible = $state(true);
  
  let showChangesMenu = $state(false);
  let showGraphMenu = $state(false);

  const isChangesTreeView = $derived($sourceControlStore.changesView === 'tree');
  const isGraphTreeView = $derived($sourceControlStore.graphView === 'tree');
  const collapsedFolders = $derived(new Set($sourceControlStore.collapsedFolders));
  const collapsedGraphFolders = $derived(new Set($sourceControlStore.graphCollapsedFolders));

  let expandedCommit = $state<string | null>(null);
  let expandedCommitFiles = $state<import('../../services/git').GitFileStatus[]>([]);
  let expandedCommitLoading = $state(false);
  const iconTheme = $derived(settingsStore.effectiveSettings.icon_theme);
  const expandedCommitTree = $derived(buildChangeTree(expandedCommitFiles));

  async function toggleCommitExpansion(commitHash: string) {
    if (expandedCommit === commitHash) {
      expandedCommit = null;
    } else {
      expandedCommit = commitHash;
      expandedCommitLoading = true;
      if ($gitRepoStore.cwd) {
        expandedCommitFiles = await getCommitFiles($gitRepoStore.cwd, commitHash);
      }
      expandedCommitLoading = false;
    }
  }

  // Resize state
  let changesFlex = $state(1);
  let graphFlex = $state(1);
  let isResizing = $state(false);

  function openGitOutput() {
    terminalStore.setActivePanel('output');
    terminalStore.setVisibility(true);
  }

  let availability = $derived($gitRepoStore.availability);
  let repo = $derived($gitRepoStore.repo);
  const conflictedTree = $derived(buildChangeTree(repo?.conflicted ?? []));
  const stagedTree = $derived(buildChangeTree(repo?.staged ?? []));
  const unstagedTree = $derived(buildChangeTree(repo?.unstaged ?? []));
  const untrackedTree = $derived(buildChangeTree(repo?.untracked ?? []));
  let commits = $derived($gitRepoStore.commits);
  let lastError = $derived($gitRepoStore.lastError);
  let syncing = $derived($gitRepoStore.syncing);
  let progress = $derived($gitRepoStore.progress);
  let repoLoading = $derived($gitRepoStore.repoLoading);
  let availabilityLoading = $derived($gitRepoStore.availabilityLoading);

  const isGitInstalled = $derived(availability.status === 'Available');
  const isRepo = $derived(repo?.status === 'Repo');

  function startResize(e: MouseEvent) {
    isResizing = true;
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent) {
    if (!isResizing) return;
    const container = document.getElementById('sc-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    let ratio = (e.clientY - rect.top) / rect.height;
    if (ratio < 0.1) ratio = 0.1;
    if (ratio > 0.9) ratio = 0.9;
    changesFlex = ratio;
    graphFlex = 1 - ratio;
  }

  function onMouseUp() {
    isResizing = false;
  }

  async function handleInit() {
    if (!$ui.explorerRoot) return;
    await gitRepoStore.initRepo();
    await gitRepoStore.refresh();
  }

  async function handleCommit() {
    if (!commitMessage.trim()) return;
    
    if (repo && repo.staged.length === 0) {
      const hasUnstaged = repo.unstaged.length > 0 || repo.untracked.length > 0;
      if (!hasUnstaged) {
        uiStore.addToast('Commit', undefined, 'There are no changes to commit.');
        return;
      }
      
      const proceed = confirm("There are no staged changes to commit. Would you like to stage all your changes and commit them directly?");
      if (!proceed) return;
      
      isCommitting = true;
      await handleStageAll();
    } else {
      isCommitting = true;
    }

    const ok = await gitRepoStore.commit(commitMessage);
    isCommitting = false;
    if (ok) commitMessage = '';
  }

  async function handleStage(file: GitFileStatus) {
    await gitRepoStore.stage(file.path);
  }

  async function handleUnstage(file: GitFileStatus) {
    await gitRepoStore.unstage(file.path);
  }

  async function handleStageAll() {
    await gitRepoStore.stageAll();
  }

  async function handleUnstageAll() {
    await gitRepoStore.unstageAll();
  }

  async function handleDiscard(file: GitFileStatus) {
    if (!confirm(`Discard changes to ${file.path}? This cannot be undone.`)) return;
    await gitRepoStore.discard(file.path);
  }

  async function handlePush() {
    const ok = await gitRepoStore.sync('git_push', 'push');
    if (ok) uiStore.addToast('Git Push', 'success', 'Successfully pushed to remote');
  }

  async function handlePull() {
    const ok = await gitRepoStore.sync('git_pull', 'pull');
    if (ok) {
      uiStore.addToast('Git Pull', 'success', 'Successfully pulled from remote');
    }
  }

  async function handleFetch() {
    const ok = await gitRepoStore.sync('git_fetch', 'fetch');
    if (ok) uiStore.addToast('Git Fetch', 'success', 'Fetched from remote');
  }

  async function handleCancelSync() {
    await gitRepoStore.cancelSync();
  }

  async function handleRefresh() {
    await gitRepoStore.refresh();
  }

  async function handleRedetect() {
    await gitRepoStore.reDetect();
  }

  function openManualPathSettings() {
    showManualPath = !showManualPath;
    manualPathInput = availability.path || '';
  }

  async function saveManualPath() {
    await gitRepoStore.setManualPath(manualPathInput.trim());
    showManualPath = false;
  }

  async function clearManualPath() {
    await gitRepoStore.setManualPath('');
    showManualPath = false;
  }

  import { getGitFileContent, getCommitFiles } from '../../services/git';
  import type { EditorTab } from '../../stores/editor';

  /** Open (or activate) a tab in the active split pane — SplitEditorPane renders
   *  pane tabs from the split store, so every add is mirrored into it.
   *  Preview-tab rules: an already-open tab is only activated (never reloaded);
   *  otherwise an unmodified current tab is replaced in place, and a new tab is
   *  only added when the current tab has unsaved changes. Returns whether the
   *  tab was actually added/replaced (false = existing tab was only activated). */
  function addTabToActivePane(newTab: EditorTab, matchByPath = false): { id: string; isNew: boolean } {
    const splitSnap = splitStore.getSnapshot();
    const activePaneId = splitSnap.activePaneId;
    const pane = activePaneId ? splitSnap.panes[activePaneId] : null;

    const existing = pane?.tabs.find((t) => t.id === newTab.id || (matchByPath && t.path === newTab.path));
    if (existing && activePaneId) {
      splitStore.setActivePaneTab(activePaneId, existing.id);
      editorStore.setActiveTab(existing.id);
      return { id: existing.id, isNew: false };
    }

    // Replace the current tab in place when it has no unsaved changes.
    if (activePaneId && pane?.activeTabId) {
      const active = pane.tabs.find((t) => t.id === pane.activeTabId);
      if (active && !active.isModified && active.id !== newTab.id) {
        const isUntitledWithContent = active.path.startsWith('Untitled') &&
          active.content && active.content.trim() !== '';
        if (!isUntitledWithContent) {
          editorStore.closeTab(active.id);
          editorStore.addTab(newTab);
          editorStore.setActiveTab(newTab.id);
          splitStore.replaceTabInPane(activePaneId, active.id, newTab);
          return { id: newTab.id, isNew: true };
        }
      }
    }

    editorStore.addTab(newTab);
    editorStore.setActiveTab(newTab.id);
    if (activePaneId) splitStore.addTabToPane(activePaneId, newTab);
    return { id: newTab.id, isNew: true };
  }

  /** Copy the up-to-date tab from the editor store back into the split store
   *  (SplitEditorPane reads the split store, so content must land there). */
  function syncTabToPanes(tabId: string) {
    const updatedTab = editorStore.getTabsSnapshot().find((t) => t.id === tabId);
    if (updatedTab) splitStore.updateTabInAllPanes(updatedTab);
  }

  /** Open a plain, explorer-style tab — eagerly reads from disk. */
  async function openPlainTab(fullPath: string, name: string) {
    const splitSnap = splitStore.getSnapshot();
    const activePaneId = splitSnap.activePaneId;
    const pane = activePaneId ? splitSnap.panes[activePaneId] : null;
    const existing = pane?.tabs.find((t) => t.path === fullPath);
    if (existing && activePaneId) {
      splitStore.setActivePaneTab(activePaneId, existing.id);
      editorStore.setActiveTab(existing.id);
      return;
    }

    let content: string | null = null;
    let isLargeFile = false;
    let isPreview = false;
    try {
      content = await invoke<string>('read_file_text', { path: fullPath });
    } catch (e) {
      if (String(e) === '__BINARY__') {
        content = '';
      } else if (String(e) === '__LARGE_FILE__') {
        const chunked = await invoke<any>('read_file_chunked', { path: fullPath });
        content = chunked.content;
        isLargeFile = true;
        isPreview = true;
      } else {
        console.error('Failed to open file:', e);
        uiStore.addToast('Open File', 'alert', String(e));
        return;
      }
    }
    const language = await invoke<string>('detect_language', { path: fullPath }).catch(() => 'plaintext');
    const tab: EditorTab = {
      id: `sc-${Date.now()}`,
      path: fullPath,
      name,
      content,
      originalContent: content,
      isModified: false,
      language,
      isPreview,
      isLargeFile,
      isUnsupported: false,
      lastAccessed: Date.now(),
      status: content !== null ? ('active' as const) : ('loaded' as const),
    };
    addTabToActivePane(tab, true);
  }

  /** Changes section — modified files open a "Working Tree" diff with the
   *  right side editable; new/untracked files open like the explorer. SVG is
   *  text here, so it participates in the diff like any other code file. */
  async function openFile(file: GitFileStatus) {
    if (!$ui.explorerRoot) return;
    const fullPath = `${$ui.explorerRoot}/${file.path}`;
    const name = file.path.split('/').pop() || file.path;

    const isImage = /\.(png|jpe?g|gif|webp|ico)$/i.test(name);
    if (isImage) {
      window.dispatchEvent(new CustomEvent('request-open-file', { detail: { path: fullPath } }));
      return;
    }

    // New files (untracked/added) have nothing to diff against — plain tab.
    if (file.status === 'U' || file.status === 'A') {
      await openPlainTab(fullPath, name);
      return;
    }

    if (file.status === 'Deleted' || file.status === 'D') {
      uiStore.addToast(`File ${name} is deleted from disk`, 'success');
      // Continue to show diff against empty
    }

    const originalContent = (await getGitFileContent($ui.explorerRoot, file.path, "HEAD")) ?? '';
    const tabId = fullPath + "-diff";

    const { isNew } = addTabToActivePane({
      id: tabId,
      path: fullPath,
      name: `${name} (Working Tree)`,
      content: null,
      originalContent: null,
      isModified: false,
      language: 'plaintext',
      isPreview: true,
      isLoading: true,
      isDiff: true,
      diffOriginalContent: originalContent,
      diffOriginalLabel: `${name} (HEAD)`,
      diffCurrentLabel: `${name} (Working Tree)`,
      diffOriginalRevision: 'HEAD',
      diffCurrentRevision: 'working-tree',
      diffEditable: true,
      noPreview: true,
      isUnsupported: false,
      lastAccessed: Date.now(),
      status: 'active' as const,
    });
    // Already open → just activated, do not reload (and never clobber edits).
    if (!isNew) return;

    invoke<string>('read_file_text', { path: fullPath }).then(async (content) => {
      const language = await invoke<string>('detect_language', { path: fullPath }).catch(() => 'plaintext');
      editorStore.setInitialContent(tabId, content);
      editorStore.setTabLoading(tabId, false);
      editorStore.updateTab(tabId, { language, languageDetected: true });
      syncTabToPanes(tabId);
    }).catch(err => {
      console.error(err);
      editorStore.setInitialContent(tabId, '');
      editorStore.setTabLoading(tabId, false);
      syncTabToPanes(tabId);
    });
  }

  /** Graph section — a commit file opens at that revision: plain read-only tab
   *  when the file is new, read-only diff against its parent otherwise.
   *  Commit tabs always show code (no preview) — diffs are the comparison. */
  async function openCommitFile(file: GitFileStatus, commitHash: string, parentHash?: string | null) {
    if (!$ui.explorerRoot) return;
    const fullPath = `${$ui.explorerRoot}/${file.path}`;
    const name = file.path.split('/').pop() || file.path;
    const shortHash = commitHash.slice(0, 7);
    const prevShort = parentHash ? parentHash.slice(0, 7) : '(root)';
    // SVG is text, so it opens as code/diff — only raster images use a viewer.
    const isImage = /\.(png|jpe?g|gif|webp|ico)$/i.test(name);

    // No previous version (added file) — same tab format as explorer but frozen
    // at the commit revision and read-only.
    if (file.status === 'A') {
      const content = isImage
        ? null
        : (await getGitFileContent($ui.explorerRoot, file.path, commitHash)) ?? '';
      const language = isImage
        ? 'image'
        : await invoke<string>('detect_language', { path: fullPath }).catch(() => 'plaintext');

      addTabToActivePane({
        id: `${fullPath}::${commitHash}`,
        path: fullPath,
        name: `${name} (${shortHash})`,
        content,
        originalContent: content,
        isModified: false,
        language,
        languageDetected: true,
        isPreview: true,
        isLoading: false,
        readOnly: true,
        gitRevision: commitHash,
        noPreview: true,
        isUnsupported: false,
        lastAccessed: Date.now(),
        status: 'active' as const,
      });
      return;
    }

    // Deleted in this commit — nothing to compare against: show the file's
    // last existing version (the parent revision), read-only, no split.
    if (file.status === 'D') {
      const revision = parentHash || '';
      const revShort = parentHash ? parentHash.slice(0, 7) : '(root)';
      const content = isImage
        ? null
        : (await getGitFileContent($ui.explorerRoot, file.path, revision)) ?? '';
      const language = isImage
        ? 'image'
        : await invoke<string>('detect_language', { path: fullPath }).catch(() => 'plaintext');

      addTabToActivePane({
        id: `${fullPath}::${commitHash}-deleted`,
        path: fullPath,
        name: `${name} (${revShort})`,
        content,
        originalContent: content,
        isModified: false,
        language,
        languageDetected: true,
        isPreview: true,
        isLoading: false,
        readOnly: true,
        gitRevision: parentHash || '',
        noPreview: true,
        isUnsupported: false,
        lastAccessed: Date.now(),
        status: 'active' as const,
      });
      return;
    }

    if (isImage) {
      addTabToActivePane({
        id: `${fullPath}::${commitHash}-imagediff`,
        path: fullPath,
        name: `${name} (${prevShort}) <-> ${name} (${shortHash})`,
        content: null,
        originalContent: null,
        isModified: false,
        language: 'image-diff',
        languageDetected: true,
        isPreview: true,
        isLoading: false,
        diffOriginalLabel: `${name} (${prevShort})`,
        diffCurrentLabel: `${name} (${shortHash})`,
        diffOriginalRevision: parentHash || '',
        diffCurrentRevision: commitHash,
        noPreview: true,
        isUnsupported: false,
        lastAccessed: Date.now(),
        status: 'active' as const,
      });
      return;
    }

    const originalContent = parentHash
      ? (await getGitFileContent($ui.explorerRoot, file.path, parentHash)) ?? ''
      : '';
    const currentContent = (await getGitFileContent($ui.explorerRoot, file.path, commitHash)) ?? '';
    const language = await invoke<string>('detect_language', { path: fullPath }).catch(() => 'plaintext');

    addTabToActivePane({
      id: `${fullPath}::${commitHash}-diff`,
      path: fullPath,
      name: `${name} (${prevShort}) <-> ${name} (${shortHash})`,
      content: currentContent,
      originalContent: currentContent,
      isModified: false,
      language,
      languageDetected: true,
      isPreview: true,
      isLoading: false,
      isDiff: true,
      diffOriginalContent: originalContent,
      diffOriginalLabel: `${name} (${prevShort})`,
      diffCurrentLabel: `${name} (${shortHash})`,
      diffOriginalRevision: parentHash || '',
      diffCurrentRevision: commitHash,
      diffEditable: false,
      noPreview: true,
      isUnsupported: false,
      lastAccessed: Date.now(),
      status: 'active' as const,
    });
  }

  onMount(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  });

</script>

  {#snippet unstageActions(file: import('../../services/git').GitFileStatus)}
    <Tooltip content="Unstage Changes">
      <button onclick={(e) => { e.stopPropagation(); handleUnstage(file); }} class="p-1 rounded hover:bg-hover text-icon-default hover:text-icon-active">
        <Minus class="w-3.5 h-3.5" />
      </button>
    </Tooltip>
  {/snippet}

  {#snippet stageDiscardActions(file: import('../../services/git').GitFileStatus)}
    <Tooltip content="Discard Changes">
      <button onclick={(e) => { e.stopPropagation(); handleDiscard(file); }} class="p-1 rounded hover:bg-hover text-icon-default hover:text-[var(--color-error)]">
        <Undo2 class="w-3.5 h-3.5" />
      </button>
    </Tooltip>
    <Tooltip content="Stage Changes">
      <button onclick={(e) => { e.stopPropagation(); handleStage(file); }} class="p-1 rounded hover:bg-hover text-icon-default hover:text-icon-active">
        <Plus class="w-3.5 h-3.5" />
      </button>
    </Tooltip>
  {/snippet}

  {#snippet stageOnlyActions(file: import('../../services/git').GitFileStatus)}
    <Tooltip content="Stage File">
      <button onclick={(e) => { e.stopPropagation(); handleStage(file); }} class="p-1 rounded hover:bg-hover text-icon-default hover:text-icon-active">
        <Plus class="w-3.5 h-3.5" />
      </button>
    </Tooltip>
  {/snippet}


  {#snippet noActions(_: import('../../services/git').GitFileStatus)}
    <!-- no actions -->
  {/snippet}

  {#snippet renderTreeNodes(nodes: ChangeTreeNode[], depth: number, fileActions: import('svelte').Snippet<[import('../../services/git').GitFileStatus]>, overrideStatus?: string, onOpen: (file: import('../../services/git').GitFileStatus) => void = openFile, view: 'changes' | 'graph' = 'changes')}
    {@const collapsed = view === 'graph' ? collapsedGraphFolders : collapsedFolders}
    {@const toggleCollapse = (path: string) => sourceControlStore.toggleCollapsedFolder(view, path)}
    {#each nodes as node (node.path)}
      {#if node.type === 'folder'}
        <div class="relative flex flex-col">
          <div class="sticky shadow-[0_1px_2px_rgba(0,0,0,0.1)] h-7 flex items-center" style="background-color: var(--tree-bg, var(--color-surface)); top: {28 + depth * 28}px; z-index: {20 - depth};">
            <div role="button" tabindex="0" class="flex-1 flex items-center py-1 hover:bg-hover group cursor-pointer h-7" style="padding-left: calc(var(--base-pad, 0px) + {6 + depth * 14}px); padding-right: 12px;" onclick={() => toggleCollapse(node.path)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleCollapse(node.path); }}>
              <span class="w-3.5 mr-1 flex items-center justify-center text-icon-default shrink-0">
                {#if node.count > 0}
                  {#if collapsed.has(node.path)}
                    <ChevronRight class="w-3.5 h-3.5" />
                  {:else}
                    <ChevronDown class="w-3.5 h-3.5" />
                  {/if}
                {/if}
              </span>
              {#if iconTheme === 'default' || !iconTheme}
                {#if collapsed.has(node.path)}
                  <Folder class="w-4 h-4 mr-1.5 shrink-0 text-icon-default" />
                {:else}
                  <FolderOpen class="w-4 h-4 mr-1.5 shrink-0 text-icon-default" />
                {/if}
              {:else if iconTheme === 'material'}
                <MaterialIcon name={node.name} isDir size={14} isOpen={!collapsed.has(node.path)} />
              {/if}
              <span class="text-xs truncate flex-1">{node.name}</span>
              <span class="bg-surface-3 rounded-full px-1.5 py-0.5 text-[9px] font-medium text-muted">{node.count}</span>
            </div>
          </div>
          {#if !collapsed.has(node.path)}
            {@render renderTreeNodes(node.children, depth + 1, fileActions, overrideStatus, onOpen, view)}
          {/if}
        </div>
      {:else}
        {@render fileRow(node.file as import('../../services/git').GitFileStatus, getGitStatusStyle(overrideStatus || node.file!.status), depth, fileActions, onOpen)}
      {/if}
    {/each}
  {/snippet}

  {#snippet fileRow(file: import('../../services/git').GitFileStatus, statusStyle: string, depth = 0, actions: import('svelte').Snippet<[import('../../services/git').GitFileStatus]> = noActions, onOpen: (file: import('../../services/git').GitFileStatus) => void = openFile)}
    {@const Icon = getFileIcon(file.path.split('/').pop() || '')}
    <div role="button" tabindex="0" class="flex items-center justify-between py-1 hover:bg-hover group cursor-pointer h-8" style="padding-left: calc(var(--base-pad, 0px) + {12 + depth * 14}px); padding-right: 12px;" onclick={() => onOpen(file)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(file); }}>
      <div class="flex items-center gap-2 overflow-hidden flex-1">
        {#if iconTheme === 'default' || !iconTheme}
          <Icon size={14} class="shrink-0" style={statusStyle} />
        {:else if iconTheme === 'material'}
          <MaterialIcon name={file.path.split('/').pop() || ''} size={14} />
        {/if}
        <span class="text-sm truncate" style={statusStyle}>{file.path.split('/').pop()}</span>
        <span class="text-[10px] text-muted truncate">{file.path.split('/').slice(0, -1).join('/')}</span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <div class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          {@render actions(file)}
          <Tooltip content="Open File">
            <button onclick={(e) => { e.stopPropagation(); onOpen(file); }} class="p-1 rounded hover:bg-hover text-icon-default hover:text-icon-active">
              <FileText class="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
        <span class="text-[10px] font-mono font-bold w-4 text-center shrink-0" style={statusStyle}>
          {file.status}
        </span>
      </div>
    </div>
  {/snippet}


<div class="flex flex-col h-full bg-surface">
  {#if availabilityLoading}
    <div class="flex flex-col items-center justify-center h-full p-4 gap-3 text-center">
      <Loader2 class="w-5 h-5 animate-spin text-accent" />
      <span class="text-sm text-muted">Detecting Git…</span>
    </div>
  {:else if !isGitInstalled}
    <div class="flex flex-col items-center justify-center h-full p-4 gap-3 text-center">
      <span class="text-sm font-semibold" style="color: var(--color-error)">Git Not Found</span>
      <span class="text-xs text-muted">Install Git and Notron will detect it, or set the executable path manually.</span>

      {#if !showManualPath}
        <div class="flex items-center gap-2">
          <button
            onclick={handleRedetect}
            class="flex items-center gap-1 px-3 py-1.5 bg-surface-2 hover:bg-hover border border-subtle text-secondary rounded text-xs transition-colors font-medium"
          >
            <RefreshCw class="w-3.5 h-3.5" /> Re-detect
          </button>
          <button
            onclick={openManualPathSettings}
            class="flex items-center gap-1 px-3 py-1.5 bg-surface-2 hover:bg-hover border border-subtle text-secondary rounded text-xs transition-colors font-medium"
          >
            <Settings class="w-3.5 h-3.5" /> Set Path…
          </button>
        </div>
      {/if}

      {#if showManualPath}
        <div class="w-full max-w-[280px] flex flex-col gap-2">
          <input
            bind:value={manualPathInput}
            placeholder="/usr/bin/git or C:\Program Files\Git\cmd\git.exe"
            class="w-full bg-surface-2 border border-subtle focus:border-accent outline-none rounded p-2 text-xs text-primary"
          />
          <div class="flex items-center gap-2 justify-end">
            <button onclick={saveManualPath} class="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent rounded text-xs transition-colors font-medium">Save</button>
            {#if availability.path}
              <button onclick={clearManualPath} class="px-3 py-1.5 bg-surface-2 hover:bg-hover border border-subtle text-secondary rounded text-xs transition-colors">Clear</button>
            {/if}
            <button onclick={() => showManualPath = false} class="p-1.5 rounded hover:bg-hover text-icon-default"><X class="w-3.5 h-3.5" /></button>
          </div>
        </div>
      {/if}
    </div>
  {:else if repoLoading && !repo}
    <div class="flex flex-col items-center justify-center h-full p-4 gap-3 text-center">
      <Loader2 class="w-5 h-5 animate-spin text-accent" />
      <span class="text-sm text-muted">Checking repository…</span>
    </div>
  {:else if !isRepo}
    <div class="flex flex-col items-center justify-center h-full p-4 gap-4 text-center">
      <span class="text-sm text-muted">The workspace is not a Git repository.</span>
      <button
        onclick={handleInit}
        class="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent rounded text-sm transition-colors w-full"
      >
        Initialize Repository
      </button>
    </div>
  {:else if repo}
    <!-- Git Actions Header -->
    <div class="p-3 border-b border-subtle flex flex-col gap-2 bg-surface">
      <div class="flex items-center justify-between mb-1 relative">
        <span class="text-xs font-semibold text-primary">CHANGES</span>
        <div class="flex items-center gap-1">
          <Tooltip content="Refresh">
            <button onclick={handleRefresh} disabled={syncing} class="p-1 rounded hover:bg-hover text-icon-default disabled:opacity-50">
              <RefreshCw class="w-3.5 h-3.5 {syncing ? 'animate-spin' : ''}" />
            </button>
          </Tooltip>
          <Tooltip content="More Actions">
            <button onclick={() => showChangesMenu = !showChangesMenu} class="p-1 rounded hover:bg-hover text-icon-default">
              <MoreHorizontal class="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
        {#if showChangesMenu}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="fixed inset-0 z-40" onclick={() => showChangesMenu = false}></div>
          <div class="absolute right-0 top-6 z-50 w-48 bg-surface border border-subtle rounded shadow-elevated flex flex-col py-1 text-xs text-primary">
            <button onclick={() => { sourceControlStore.setChangesView('list'); showChangesMenu = false; }} class="flex items-center px-3 py-1.5 hover:bg-hover transition-colors">
              <span class="w-4 flex justify-center shrink-0 mr-1">{#if !isChangesTreeView}<Check class="w-3.5 h-3.5" />{/if}</span>
              View as List
            </button>
            <button onclick={() => { sourceControlStore.setChangesView('tree'); showChangesMenu = false; }} class="flex items-center px-3 py-1.5 hover:bg-hover transition-colors">
              <span class="w-4 flex justify-center shrink-0 mr-1">{#if isChangesTreeView}<Check class="w-3.5 h-3.5" />{/if}</span>
              View as Tree
            </button>
            <div class="h-px bg-subtle my-1"></div>
            <button onclick={() => { openGitOutput(); showChangesMenu = false; }} class="flex items-center px-3 py-1.5 hover:bg-hover transition-colors">
              <span class="w-4 flex justify-center shrink-0 mr-1"></span>
              View Git Output
            </button>
          </div>
        {/if}
      </div>
      
      <div class="relative">
        <textarea
          bind:value={commitMessage}
          placeholder="Message (Ctrl+Enter to commit)"
          class="w-full bg-surface-2 border border-subtle focus:border-accent outline-none rounded p-2 text-xs text-primary resize-none min-h-[64px]"
          onkeydown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              handleCommit();
            }
          }}
        ></textarea>
      </div>

      {#if repo && repo.staged.length === 0 && repo.unstaged.length === 0 && repo.untracked.length === 0}
        {#if !repo.has_upstream}
          <button
            onclick={handlePush}
            disabled={syncing}
            class="flex items-center justify-center gap-2 w-full py-2 mt-1 bg-accent hover:bg-accent-hover disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed text-on-accent rounded text-sm transition-colors font-medium border border-transparent"
          >
            {#if syncing}
              <Loader2 class="w-4 h-4 animate-spin" />
            {:else}
              <Upload class="w-4 h-4" />
            {/if}
            <span>Publish Branch</span>
          </button>
        {:else if repo.ahead > 0 || repo.behind > 0}
          <button
            onclick={async () => {
              if (repo && repo.behind > 0) {
                const ok = await gitRepoStore.sync('git_pull', 'pull');
                if (!ok) return;
              }
              if (repo && repo.ahead > 0) {
                const ok = await gitRepoStore.sync('git_push', 'push');
                if (ok) uiStore.addToast('Git Sync', 'success', 'Successfully synced with remote');
              }
            }}
            disabled={syncing}
            class="flex items-center justify-center gap-2 w-full py-2 mt-1 bg-accent hover:bg-accent-hover disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed text-on-accent rounded text-sm transition-colors font-medium border border-transparent"
          >
            {#if syncing}
              <Loader2 class="w-4 h-4 animate-spin" />
            {:else}
              <RefreshCw class="w-4 h-4" />
            {/if}
            <span>Sync Changes {repo.behind > 0 ? `${repo.behind}↓ ` : ''}{repo.ahead > 0 ? `${repo.ahead}↑` : ''}</span>
          </button>
        {:else}
          <button
            disabled={true}
            class="flex items-center justify-center gap-2 w-full py-2 mt-1 bg-accent disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed text-on-accent rounded text-sm transition-colors font-medium border disabled:border-subtle border-transparent"
          >
            <span>Commit</span>
          </button>
        {/if}
      {:else}
        <button
          onclick={handleCommit}
          disabled={isCommitting || !commitMessage.trim()}
          class="flex items-center justify-center gap-2 w-full py-2 mt-1 bg-accent hover:bg-accent-hover disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed text-on-accent rounded text-sm transition-colors font-medium border disabled:border-subtle border-transparent"
        >
          {#if isCommitting}
            <Loader2 class="w-4 h-4 animate-spin" />
          {/if}
          <span>Commit</span>
        </button>
      {/if}

      {#if syncing && progress}
        <div class="flex flex-col gap-1 mt-1">
          <div class="w-full h-1 bg-surface-3 rounded overflow-hidden">
            <div
              class="h-full bg-accent transition-all"
              style="width: {Math.min(progress.percent ?? 100, 100)}%"
            ></div>
          </div>
          <div class="text-[10px] text-muted truncate">{progress.phase}: {progress.message}</div>
        </div>
      {/if}

      {#if lastError}
        <div class="text-[10px] rounded px-2 py-1 break-words max-h-20 overflow-y-auto mt-1" style="color: var(--color-error); background-color: color-mix(in srgb, var(--color-error) 10%, transparent); border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent);">
          {lastError}
        </div>
      {/if}
    </div>

    <!-- Split View Container -->
    <div class="flex-1 overflow-hidden flex flex-col" id="sc-container">

      <!-- Top Section: CHANGES -->
      <div class="flex flex-col overflow-hidden" style="flex: {changesVisible ? changesFlex : 0}; min-height: {changesVisible ? '40px' : '0'}; display: {changesVisible ? 'flex' : 'none'};">

        <div class="flex-1 overflow-y-auto">
          {#if repo.conflicted.length > 0}
            <div class="flex items-center justify-between px-3 py-1 bg-surface-2 group sticky top-0 z-10 border-b border-subtle shadow-elevated-sm">
              <span class="text-[10px] font-semibold uppercase" style="color: var(--accent)">Conflicts</span>
            </div>
            <div class="flex flex-col mb-2">
              {#if isChangesTreeView}
                {@render renderTreeNodes(conflictedTree, 0, noActions, 'Conflict')}
              {:else}
                {#each repo.conflicted as file (file.path)}
                  {@render fileRow(file, getGitStatusStyle('Conflict'), 0, noActions)}
                {/each}
              {/if}
            </div>
          {/if}

          {#if repo.staged.length > 0}
            <div class="flex items-center justify-between px-3 py-1 bg-surface-2 group sticky top-0 z-30 h-7 border-b border-subtle shadow-elevated-sm">
              <span class="text-[10px] font-semibold uppercase text-secondary">Staged Changes</span>
              <div class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Tooltip content="Unstage All Changes">
                  <button onclick={handleUnstageAll} class="p-1 rounded hover:bg-hover text-icon-default hover:text-icon-active">
                    <Minus class="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
              </div>
            </div>
            <div class="flex flex-col mb-2">
              {#if isChangesTreeView}
                {@render renderTreeNodes(stagedTree, 0, unstageActions)}
              {:else}
                {#each repo.staged as file (file.path)}
                  {@render fileRow(file, getGitStatusStyle(file.status), 0, unstageActions)}
                {/each}
              {/if}
            </div>
          {/if}

          {#if repo.unstaged.length > 0 || repo.untracked.length > 0}
            <div class="flex items-center justify-between px-3 py-1 bg-surface-2 group sticky top-0 z-30 h-7 border-y border-subtle shadow-elevated-sm mt-2">
              <span class="text-[10px] font-semibold uppercase text-secondary">Changes</span>
              <div class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Tooltip content="Stage All Changes">
                  <button onclick={handleStageAll} class="p-1 rounded hover:bg-hover text-icon-default hover:text-icon-active">
                    <Plus class="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
              </div>
            </div>
            <div class="flex flex-col">
              {#if isChangesTreeView}
                {@render renderTreeNodes(unstagedTree, 0, stageDiscardActions)}
              {:else}
                {#each repo.unstaged as file (file.path)}
                  {@render fileRow(file, getGitStatusStyle(file.status), 0, stageDiscardActions)}
                {/each}
              {/if}

              {#if repo.untracked.length > 0}
                <div class="px-3 py-1 text-[10px] font-semibold uppercase text-secondary bg-surface-2/50 mt-1">Untracked</div>
                {#if isChangesTreeView}
                {@render renderTreeNodes(untrackedTree, 0, stageOnlyActions, 'U')}
              {:else}
                {#each repo.untracked as file (file.path)}
                  {@render fileRow(file, getGitStatusStyle('U'), 0, stageOnlyActions)}
                {/each}
              {/if}
              {/if}
            </div>
          {:else if repo.staged.length === 0 && repo.conflicted.length === 0}
            <div class="flex items-center justify-center p-8">
              <span class="text-sm text-muted">No changes found.</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- Splitter / Resizer -->
      {#if changesVisible && graphVisible}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div class="h-[3px] bg-subtle hover:bg-accent cursor-ns-resize transition-colors shrink-0 relative z-20" onmousedown={startResize} role="separator" tabindex="0"></div>
      {/if}

      <!-- Collapsed header for Changes if hidden -->
      {#if !changesVisible}
        <div role="button" tabindex="0" class="flex items-center px-2 py-1 bg-surface-2 border-b border-subtle cursor-pointer hover:bg-hover shrink-0" onclick={() => changesVisible = !changesVisible} onkeydown={(e) => { if (e.key === 'Enter') changesVisible = !changesVisible; }}>
          <ChevronRight class="w-3.5 h-3.5 mr-1 text-icon-default" />
          <span class="text-xs font-semibold uppercase text-secondary">Changes</span>
          <span class="ml-auto bg-surface-3 rounded-full px-1.5 py-0.5 text-[10px]">{repo.staged.length + repo.unstaged.length + repo.untracked.length + repo.conflicted.length}</span>
        </div>
      {/if}

      <!-- Collapsed header for Graph if hidden -->
      {#if !graphVisible}
        <div role="button" tabindex="0" class="flex items-center px-2 py-1 bg-surface-2 border-b border-subtle cursor-pointer hover:bg-hover shrink-0" onclick={() => graphVisible = !graphVisible} onkeydown={(e) => { if (e.key === 'Enter') graphVisible = !graphVisible; }}>
          <ChevronRight class="w-3.5 h-3.5 mr-1 text-icon-default" />
          <span class="text-xs font-semibold uppercase text-secondary">Graph</span>
        </div>
      {/if}

      <!-- Bottom Section: GRAPH -->
      <div class="flex flex-col overflow-hidden" style="flex: {graphVisible ? graphFlex : 0}; min-height: {graphVisible ? '40px' : '0'}; display: {graphVisible ? 'flex' : 'none'};">
        <div class="flex items-center justify-between px-2 py-1 bg-surface-2 border-b border-y border-subtle shrink-0 relative">
          <div role="button" tabindex="0" class="flex items-center cursor-pointer hover:bg-hover flex-1" onclick={() => graphVisible = !graphVisible} onkeydown={(e) => { if (e.key === 'Enter') graphVisible = !graphVisible; }}>
            <ChevronDown class="w-3.5 h-3.5 mr-1 text-icon-default" />
            <span class="text-xs font-semibold uppercase text-secondary">Graph</span>
          </div>
          
            <div class="flex items-center gap-1 shrink-0">
              <Tooltip content="Refresh Graph">

              <button onclick={handleRefresh} disabled={syncing} class="p-1 rounded hover:bg-hover text-icon-default disabled:opacity-50">
                <RefreshCw class="w-3.5 h-3.5 {syncing ? 'animate-spin' : ''}" />
              </button>
            </Tooltip>
            <Tooltip content="Fetch All Remotes">
              <button onclick={handleFetch} disabled={syncing} class="p-1 rounded hover:bg-hover text-icon-default disabled:opacity-50">
                <Cloud class="w-3.5 h-3.5" />
              </button>
            </Tooltip>
            <Tooltip content="Pull">
              <button onclick={handlePull} disabled={syncing} class="p-1 rounded hover:bg-hover text-icon-default disabled:opacity-50">
                <Download class="w-3.5 h-3.5" />
              </button>
            </Tooltip>
            <Tooltip content="Push">
              <button onclick={handlePush} disabled={syncing} class="p-1 rounded hover:bg-hover text-icon-default disabled:opacity-50">
                <Upload class="w-3.5 h-3.5" />
              </button>
            </Tooltip>
            {#if syncing}
              <Tooltip content="Cancel">
                <button onclick={handleCancelSync} class="p-1 rounded hover:bg-hover" style="color: var(--color-error)">
                  <X class="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            {/if}
            <Tooltip content="More Actions">
              <button class="p-1 rounded hover:bg-hover text-icon-default" onclick={(e) => { e.stopPropagation(); showGraphMenu = !showGraphMenu; }}>
                <MoreHorizontal class="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>
          {#if showGraphMenu}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="fixed inset-0 z-40" onclick={() => showGraphMenu = false}></div>
            <div class="absolute right-0 top-8 z-50 w-48 bg-surface border border-subtle rounded shadow-elevated flex flex-col py-1 text-xs text-primary">
              <button onclick={() => { sourceControlStore.setGraphView('list'); showGraphMenu = false; }} class="flex items-center px-3 py-1.5 hover:bg-hover transition-colors">
                <span class="w-4 flex justify-center shrink-0 mr-1">{#if !isGraphTreeView}<Check class="w-3.5 h-3.5" />{/if}</span>
                View as List
              </button>
              <button onclick={() => { sourceControlStore.setGraphView('tree'); showGraphMenu = false; }} class="flex items-center px-3 py-1.5 hover:bg-hover transition-colors">
                <span class="w-4 flex justify-center shrink-0 mr-1">{#if isGraphTreeView}<Check class="w-3.5 h-3.5" />{/if}</span>
                View as Tree
              </button>
            </div>
          {/if}
        </div>
        <div class="flex-1 overflow-y-auto bg-surface relative">
          {#if commits.length > 0}
            <div class="absolute left-[21px] top-0 bottom-0 w-[2px] bg-subtle z-0"></div>
            {#each commits as commit (commit.hash)}
              <div class="flex flex-col">
                <!-- Commit Row -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <Tooltip 
                  side="right" 
                  unstyled={true} 
                  pointerEvents={true}
                  hoverDelay={400}
                  wrapperClass="flex w-full items-center hover:bg-hover group cursor-pointer h-7 sticky top-0 z-30 bg-surface border-y border-transparent hover:border-subtle transition-colors"
                >
                  {#snippet customContent()}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="w-[360px] bg-surface-2 border border-subtle rounded-md shadow-elevated flex flex-col pointer-events-auto cursor-default text-primary relative ml-2" onclick={(e) => e.stopPropagation()}>
                      <!-- Arrow (placed behind container to hide its right half) -->
                      <div class="absolute -left-[6px] top-1/2 -translate-y-1/2 w-3 h-3 bg-surface-2 border-l border-b border-subtle rotate-45 -z-10 rounded-sm"></div>
                      
                      <!-- Header & Body -->
                      <div class="p-3 flex flex-col gap-2 relative z-10 rounded-t-md">
                        <!-- Top Row: Name, email, date -->
                        <div class="flex items-baseline gap-2 flex-wrap">
                          <a href="mailto:{commit.email}" class="text-[13px] font-semibold text-accent hover:underline">{commit.author}</a>
                          <span class="text-[10px] text-muted ml-auto">
                            {new Date(parseInt(commit.date) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} {new Date(parseInt(commit.date) * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                        
                        <!-- Commit Message (Multi-line) -->
                        <div class="text-xs leading-relaxed whitespace-pre-wrap font-medium">
                          {commit.message}
                        </div>
                      </div>
                      
                      <!-- Line -->
                      <div class="h-px w-full bg-subtle"></div>
                      
                      <!-- Stats -->
                      <div class="px-3 py-2 text-[11px] text-muted font-medium bg-surface-2">
                        {#if commit.stats}
                          {commit.stats}
                        {:else}
                          0 files changed
                        {/if}
                      </div>

                      <!-- Line -->
                      <div class="h-px w-full bg-subtle"></div>
                      
                      <!-- Footer hashes -->
                      <div class="px-3 py-2 bg-surface-3/30 border-t border-subtle rounded-b-md flex items-center gap-2 text-[11px] relative z-10 group/hash">
                        <span class="font-mono text-primary flex-1">{commit.hash}</span>
                        <button class="p-1 rounded hover:bg-surface-2 text-icon-default opacity-0 group-hover/hash:opacity-100 transition-opacity" onclick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(commit.hash); }} title="Copy Commit Hash">
                          <Copy class="w-3.5 h-3.5" />
                        </button>
                        {#if $gitRepoStore.repo?.remote_url}
                          {@const remoteUrl = $gitRepoStore.repo.remote_url.replace(/\.git$/, '')}
                          <span class="text-subtle mx-1">|</span>
                          <a href="{remoteUrl}/commit/{commit.hash}" target="_blank" class="text-accent hover:underline flex items-center gap-1" onclick={(e) => e.stopPropagation()} title="Open on GitHub">
                            Open on GitHub
                          </a>
                        {/if}
                      </div>
                    </div>
                  {/snippet}

                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="flex w-full items-center h-full px-2" onclick={() => toggleCommitExpansion(commit.hash)}>
                    <div class="flex items-center justify-center w-5 h-5 shrink-0 bg-surface rounded-full">
                      <div class="w-2 h-2 rounded-full border-2 border-accent bg-surface z-10"></div>
                    </div>
                    <div class="flex items-center flex-1 overflow-hidden pr-2">
                      <span class="text-xs text-primary truncate font-medium flex-1">{commit.message}</span>
                      {#if commit.refs}
                        <div class="ml-2 flex items-center gap-1 shrink-0">
                          {#each commit.refs.split(', ') as ref}
                            {#if ref.includes('origin/')}
                              <span class="flex items-center gap-0.5 text-[9px] rounded-full px-1.5 py-0.5 whitespace-nowrap" style="border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent); color: var(--accent); background-color: color-mix(in srgb, var(--accent) 10%, transparent);"><Cloud class="w-2.5 h-2.5" /> {ref.replace('origin/', '')}</span>
                            {:else if ref.includes('HEAD')}
                              <span class="flex items-center gap-0.5 text-[9px] rounded-full px-1.5 py-0.5 whitespace-nowrap" style="border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent); color: var(--accent); background-color: color-mix(in srgb, var(--accent) 10%, transparent);"><Target class="w-2.5 h-2.5" /> {ref}</span>
                            {:else}
                              <span class="flex items-center gap-0.5 text-[9px] rounded-full px-1.5 py-0.5 whitespace-nowrap" style="border: 1px solid color-mix(in srgb, var(--color-success) 50%, transparent); color: var(--color-success); background-color: color-mix(in srgb, var(--color-success) 10%, transparent);"><GitBranch class="w-2.5 h-2.5" /> {ref}</span>
                            {/if}
                          {/each}
                        </div>
                      {/if}
                    </div>
                    <span class="text-[10px] text-muted shrink-0 w-20 truncate text-right group-hover:hidden">{commit.author}</span>
                    <div class="hidden group-hover:flex items-center gap-1 shrink-0 w-20 justify-end">
                      <Tooltip content="Copy Commit Hash">
                        <button class="p-1 rounded hover:bg-surface-2 text-icon-default" onclick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(commit.hash); }}>
                          <FileText class="w-3 h-3" />
                        </button>
                      </Tooltip>
                      <Tooltip content="Checkout Commit">
                        <button class="p-1 rounded hover:bg-surface-2 text-icon-default" onclick={(e) => { e.stopPropagation(); uiStore.addToast('Checkout', 'success', `Checkout ${commit.hash} not implemented yet`); }}>
                          <Target class="w-3 h-3" />
                        </button>
                      </Tooltip>
                      <Tooltip content="More Actions">
                        <button class="p-1 rounded hover:bg-surface-2 text-icon-default" onclick={(e) => { e.stopPropagation(); }}>
                          <MoreHorizontal class="w-3 h-3" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                </Tooltip>

                <!-- Expanded Files -->
                {#if expandedCommit === commit.hash}
                  <div class="flex flex-col bg-surface-2 border-y border-subtle py-1" style="--base-pad: 24px; --tree-bg: var(--color-surface-2);">
                    {#if expandedCommitLoading}
                      <div class="text-[10px] text-muted px-4 py-2 flex items-center gap-2">
                        <Loader2 class="w-3 h-3 animate-spin" /> Loading files...
                      </div>
                    {:else}
                      {#if isGraphTreeView}
                        {@render renderTreeNodes(expandedCommitTree, 0, noActions, undefined, (f: import('../../services/git').GitFileStatus) => openCommitFile(f, commit.hash, commit.parents.split(' ')[0] || null), 'graph')}
                        {#if expandedCommitFiles.length === 0}
                          <div class="text-[10px] text-muted px-4 py-1">No files changed.</div>
                        {/if}
                      {:else}
                        {#each expandedCommitFiles as file (file.path)}
                          {@render fileRow(file, getExpandedFileStatusStyle(file.status), 0, noActions, (f: import('../../services/git').GitFileStatus) => openCommitFile(f, commit.hash, commit.parents.split(' ')[0] || null))}
                        {/each}
                        {#if expandedCommitFiles.length === 0}
                          <div class="text-[10px] text-muted px-4 py-1">No files changed.</div>
                        {/if}
                      {/if}
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          {:else}
            <div class="flex items-center justify-center p-8">
              <span class="text-sm text-muted">No commits yet.</span>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Branch info at the bottom -->
    {#if repo.branch}
      <div class="px-3 py-1.5 border-t border-subtle bg-surface-2 shrink-0">
        <span class="text-xs font-semibold text-muted flex items-center gap-1.5">
          <GitBranch class="w-3.5 h-3.5" /> {repo.branch}
          {#if repo.ahead > 0 || repo.behind > 0}
            <span class="text-[10px] text-muted">
              {#if repo.ahead > 0}↑{repo.ahead}{/if}
              {#if repo.behind > 0}↓{repo.behind}{/if}
            </span>
          {/if}
        </span>
      </div>
    {/if}
  {/if}
</div>
