<script lang="ts">
  import { splitStore } from '../../stores/split';
  import type { SplitNode } from '../../stores/split';
  import SplitEditorPane from './SplitEditorPane.svelte';
  import SplitView from './SplitView.svelte';

  interface Props {
    node: SplitNode;
    EditorComponent?: any;
    DiffEditorComponent?: any;
    MarkdownPreviewComponent?: any;
    ImageViewerComponent?: any;
    ImageDiffComponent?: any;
    SettingsPageComponent?: any;
    WelcomeTabComponent?: any;
    onNewTextFile?: () => void;
    onOpenFile?: () => void;
    onOpenTerminal?: () => void;
  }

  let {
    node,
    EditorComponent,
    DiffEditorComponent,
    MarkdownPreviewComponent,
    ImageViewerComponent,
    ImageDiffComponent,
    SettingsPageComponent,
    WelcomeTabComponent,
    onNewTextFile,
    onOpenFile,
    onOpenTerminal,
  }: Props = $props();

  let isDragging = $state(false);

  function startResize(e: MouseEvent) {
    if (node.type !== 'split') return;
    e.preventDefault();
    isDragging = true;

    const container = (e.currentTarget as HTMLElement).parentElement!;
    const rect = container.getBoundingClientRect();
    const isVertical = node.direction === 'vertical';
    const nodeId = node.id;

    function onMouseMove(me: MouseEvent) {
      const ratio = isVertical
        ? (me.clientX - rect.left) / rect.width
        : (me.clientY - rect.top) / rect.height;
      splitStore.updateSplitRatio(nodeId, Math.max(0.1, Math.min(0.9, ratio)));
    }

    function onMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  let ratio = $derived(node.type === 'split' ? (node.splitRatio ?? 0.5) : 0.5);
  let isVertical = $derived(node.type === 'split' && node.direction === 'vertical');
</script>

{#if node.type === 'pane' && node.paneId}
  <SplitEditorPane
    paneId={node.paneId}
    {EditorComponent}
    {DiffEditorComponent}
    {MarkdownPreviewComponent}
    {ImageViewerComponent}
    {ImageDiffComponent}
    {SettingsPageComponent}
    {WelcomeTabComponent}
    {onNewTextFile}
    {onOpenFile}
    {onOpenTerminal}
  />
{:else if node.type === 'split' && node.children && node.children.length === 2}
  <div
    class="flex w-full h-full overflow-hidden"
    class:flex-row={isVertical}
    class:flex-col={!isVertical}
  >
    <!-- First child -->
    <div class="split-child" style={isVertical ? `flex: ${ratio} 0 0; min-width: 80px;` : `flex: ${ratio} 0 0; min-height: 60px;`}>
      <SplitView
        node={node.children[0]}
        {EditorComponent}
        {DiffEditorComponent}
        {MarkdownPreviewComponent}
        {ImageViewerComponent}
        {ImageDiffComponent}
        {SettingsPageComponent}
        {WelcomeTabComponent}
        {onNewTextFile}
        {onOpenFile}
        {onOpenTerminal}
      />
    </div>

    <!-- Resize Handle -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      role="separator"
      class="split-handle"
      class:split-handle-vertical={isVertical}
      class:split-handle-horizontal={!isVertical}
      class:split-dragging={isDragging}
      onmousedown={startResize}
      aria-label="Resize pane"
    ></div>

    <!-- Second child -->
    <div class="split-child" style={isVertical ? `flex: ${1 - ratio} 0 0; min-width: 80px;` : `flex: ${1 - ratio} 0 0; min-height: 60px;`}>
      <SplitView
        node={node.children[1]}
        {EditorComponent}
        {DiffEditorComponent}
        {MarkdownPreviewComponent}
        {ImageViewerComponent}
        {ImageDiffComponent}
        {SettingsPageComponent}
        {WelcomeTabComponent}
        {onNewTextFile}
        {onOpenFile}
        {onOpenTerminal}
      />
    </div>
  </div>
{/if}

<style>
  .split-child {
    overflow: hidden;
    position: relative;
  }
  .split-handle {
    flex: 0 0 4px;
    background: var(--color-border-subtle, #2d2d2d);
    transition: background 0.15s;
    position: relative;
    z-index: 10;
  }
  .split-handle:hover,
  .split-handle.split-dragging {
    background: var(--accent, #007acc);
  }
  .split-handle-vertical {
    cursor: ew-resize;
    width: 4px;
    height: 100%;
  }
  .split-handle-horizontal {
    cursor: ns-resize;
    height: 4px;
    width: 100%;
  }
</style>
