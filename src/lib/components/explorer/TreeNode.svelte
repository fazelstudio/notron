<script lang="ts">
  import type { FlatTreeNode } from '../../utils/treeFlattener';
  import { Folder, FolderOpen, ChevronRight, ChevronDown, Loader2, Dot } from 'lucide-svelte';
  import { settingsStore } from '../../stores/settings.svelte';
  import { gitDecorationStore } from '../../stores/gitDecoration';
  import { getFileIcon } from '../../extensions/material-icons/fileIcons';
  import { getGitStatusStyle, getGitBadgeStyle, getIgnoredStyle } from '../../utils/gitStatusStyles';
  import MaterialIcon from '../../extensions/material-icons/MaterialIcon.svelte';

  let { 
    node, 
    isSelected,
    isActive,
    activeFolderPath,
    activeFolderDepth,
    isFaded,
    isDropTarget,
    isDropInvalid,
    isCreatingChild,
    isLoading,
    onFileClick, 
    onContextMenu,
    onPointerDown,
    onPointerMove,
    onPointerUp
  } = $props<{
    node: FlatTreeNode;
    isSelected: boolean;
    isActive?: boolean;
    activeFolderPath?: string | null;
    activeFolderDepth?: number;
    isFaded?: boolean;
    isDropTarget?: boolean;
    isDropInvalid?: boolean;
    isCreatingChild?: boolean;
    isLoading: boolean;
    onFileClick: (e: MouseEvent, node: FlatTreeNode) => void;
    onContextMenu: (e: MouseEvent, node: FlatTreeNode) => void;
    onPointerDown?: (e: PointerEvent, node: FlatTreeNode) => void;
    onPointerMove?: (e: PointerEvent) => void;
    onPointerUp?: (e: PointerEvent, node: FlatTreeNode) => void;
  }>();


  const indentStyle = $derived(`padding-left: ${node.depth * 12 + 8}px; padding-right: 8px; height: 26px;`);
  
  const iconTheme = $derived(settingsStore.effectiveSettings.icon_theme);
  const gitDecoration = $derived($gitDecorationStore[node.path]);

  /**
   * The badge label shown to the right of the filename, exactly like VSCode:
   * - Files: U / A / M / D / R / C / ! (conflict)
   * - Folders (rollup): same character representing worst status inside
   */
  const gitBadgeChar = $derived((() => {
    if (!gitDecoration) return '';
    const code = gitDecoration.code;
    if (code === 'Conflict') return '!';
    return code; // U, A, M, D, R, C — all shown verbatim like VSCode
  })());

  /**
   * A gitignored entry (node.is_ignored) is shown but visually dimmed,
   * exactly like VS Code does. If the file has an active git status badge
   * (gitDecoration), that takes priority — a modified gitignored file is
   * yellow, not grey.
   */
  const isGitIgnored = $derived(node.is_ignored === true && !gitDecoration);

  const gitIconStyle = $derived(getGitStatusStyle(gitDecoration?.code));
  const gitFileNameStyle = $derived(getGitStatusStyle(gitDecoration?.code));
  const gitBadgeStyle = $derived(getGitBadgeStyle(gitDecoration?.code, gitDecoration?.is_rollup));

  // DECO-002: Dedicated dim style for ignored files (not just opacity)
  const ignoredStyle = $derived(isGitIgnored ? getIgnoredStyle() : '');

  function handleClick(e: MouseEvent) {
    e.stopPropagation();
    onFileClick(e, node);
  }
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.stopPropagation();
      onFileClick({ ctrlKey: false, shiftKey: false } as any, node);
    }
  }
  function handleContextMenu(e: MouseEvent) {
    onContextMenu(e, node);
  }
</script>

<!-- 
  PERF: Tooltip Svelte component removed — each Tooltip mounts onMount,
  $effect, and a portal DOM injection. With 30-50 visible nodes, that's
  30-50 active reactive components at once. The native `title` attribute
  is zero-cost with no JS overhead at all.
-->
<div
  role="treeitem"
  tabindex="0"
  aria-selected={isActive}
  data-node-path={node.path}
  class="relative flex items-center gap-1.5 cursor-pointer select-none w-full border text-xs transition-colors
    {isActive ? 'bg-selected ring-1 ring-inset ring-accent text-primary' : (isSelected ? 'bg-selected/60 border-transparent text-primary' : 'border-transparent hover:bg-hover hover:text-primary')}
    {isDropTarget ? 'ring-2 ring-inset ring-accent/70 bg-accent/[0.08] drop-valid' : ''}
    {isDropInvalid ? 'drop-invalid' : ''}
    {isFaded ? 'opacity-40 pointer-events-none' : ''}
    {isCreatingChild ? 'bg-accent/[0.04]' : ''}"
  style={indentStyle}
  class:selected={isSelected}
  class:active={isActive}
  class:faded={isFaded}
  class:drop-target={isDropTarget}
  class:drop-invalid={isDropInvalid}
  class:creating-child={isCreatingChild}
  class:opacity-60={isGitIgnored && !isActive}
  onclick={handleClick}
  onkeydown={handleKeyDown}
  oncontextmenu={handleContextMenu}
  onpointerdown={(e) => onPointerDown?.(e, node)}
  onpointermove={(e) => onPointerMove?.(e)}
  onpointerup={(e) => onPointerUp?.(e, node)}
>
  <!-- Indentation Guides -->
  {#if node.depth > 0}
    {@const isDescendant = activeFolderPath ? (node.path === activeFolderPath || node.path.startsWith(activeFolderPath + '\\') || node.path.startsWith(activeFolderPath + '/')) : false}
    {#each Array(node.depth).fill(0) as _, i}
      {@const isLineActive = isDescendant && i === activeFolderDepth}
      <div class="absolute -top-px -bottom-px border-l pointer-events-none transition-all duration-300 {isLineActive ? 'border-strong opacity-100 z-10' : 'border-subtle opacity-0 group-hover/tree:opacity-40'}" style="left: {14.5 + i * 12}px;"></div>
    {/each}
  {/if}
  {#if node.is_dir && node.isExpanded}
    {@const isLineActive = node.path === activeFolderPath}
    <div class="absolute -bottom-px border-l pointer-events-none transition-all duration-300 {isLineActive ? 'border-strong opacity-100 z-10' : 'border-subtle opacity-0 group-hover/tree:opacity-40'}" style="top: 13px; left: {14.5 + node.depth * 12}px;"></div>
  {/if}

  <span class="shrink-0 w-3.5 flex items-center justify-center text-muted">
    {#if node.is_dir}
      {#if isLoading}
        <Loader2 size={12} class="animate-spin" />
      {:else if node.has_children}
        {#if node.isExpanded}
          <ChevronDown size={12} />
        {:else}
          <ChevronRight size={12} />
        {/if}
      {:else if isCreatingChild}
        <Dot size={12} />
      {/if}
    {/if}
  </span>

  {#if node.is_dir}
    <!-- Folder icon: inherits git color when decorated, otherwise uses accent -->
    <span
      class="shrink-0 flex items-center"
      class:text-accent={!gitDecoration && !isGitIgnored || isActive}
      class:text-muted={isGitIgnored && !gitDecoration && !isActive}
      style={gitIconStyle}
    >
      {#if iconTheme === 'default' || !iconTheme}
        {#if node.isExpanded}
          <FolderOpen size={14} />
        {:else}
          <Folder size={14} />
        {/if}
      {:else if iconTheme === 'material'}
        <!-- We use getMaterialFolderIcon which maps to folder-src, folder-public, etc. fallback is folder-base -->
        <MaterialIcon name={node.name} isDir size={14} isOpen={node.isExpanded} />
      {/if}
    </span>
  {:else}
    <!-- File icon: inherits git color when decorated -->
    <span
      class="shrink-0 flex items-center"
      class:text-icon-active={isActive}
      class:text-icon-default={!isActive && !gitDecoration && !isGitIgnored}
      class:text-icon-muted={isGitIgnored && !gitDecoration && !isActive}
      style={gitIconStyle}
    >
      {#if iconTheme === 'default' || !iconTheme}
        {@const Icon = getFileIcon(node.name)}
        <Icon size={14} />
      {:else if iconTheme === 'material'}
        <MaterialIcon name={node.name} size={14} />
      {/if}
    </span>
  {/if}

  <!-- Filename: colored by git status exactly like VSCode -->
  <span
    class="truncate min-w-0 flex-1"
    class:text-primary={isActive}
    class:text-secondary={!isActive && !gitDecoration && !isGitIgnored}
    class:text-muted={isGitIgnored && !gitDecoration && !isActive}
    style="{gitFileNameStyle}{ignoredStyle ? '; ' + ignoredStyle : ''}"
  >
    {node.name}
  </span>
  
  <!-- Git badge: shown to the right like VSCode -->
  {#if gitDecoration}
    {#if gitDecoration.is_rollup}
      <!-- Folder rollup badge: pill-shaped like VSCode folder decoration -->
      <span class="shrink-0 text-[10px] font-bold px-1.5 rounded-full border text-center ml-1" style={gitBadgeStyle}>{gitBadgeChar}</span>
    {:else}
      <!-- File badge: single character flush-right like VSCode -->
      <span
        class="shrink-0 text-[10px] font-bold w-3.5 text-right ml-1"
        style={gitBadgeStyle}
      >
        {gitBadgeChar}
      </span>
    {/if}
  {/if}
</div>