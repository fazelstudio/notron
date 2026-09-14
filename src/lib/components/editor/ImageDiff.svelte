<!--
 * Image Diff
 *
 * Side-by-side image comparison for git revisions.
-->

<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { getGitFileBinary } from '../../services/git';
  import { dirname } from '@tauri-apps/api/path';

  let { filePath, originalLabel, currentLabel, originalRevision, currentRevision }: {
    filePath: string;
    originalLabel?: string;
    currentLabel?: string;
    originalRevision?: string;
    currentRevision?: string;
  } = $props();

  let zoom = $state(1);
  let isCtrlPressed = $state(false);

  let originalSrc = $state<string | null>(null);
  let originalLoading = $state(true);
  let currentSrc = $state<string | null>(null);
  let currentLoading = $state(true);

  async function loadImage(rev: string | undefined): Promise<string | null> {
    if (!rev) return null;
    let bytes: number[] | null = null;
    try {
      if (rev === 'working-tree') {
        bytes = await invoke<number[]>('read_file_binary', { path: filePath });
      } else {
        const dir = await dirname(filePath);
        bytes = await getGitFileBinary(dir, filePath, rev);
      }
    } catch (e) {
      console.error(e);
      return null;
    }
    
    if (!bytes || bytes.length === 0) return null;
    
    const ext = filePath.split('.').pop()?.toLowerCase();
    let mimeType = 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
    else if (ext === 'gif') mimeType = 'image/gif';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'svg') mimeType = 'image/svg+xml';
    else if (ext === 'ico') mimeType = 'image/x-icon';
    
    const uint8Array = new Uint8Array(bytes);
    const blob = new Blob([uint8Array], { type: mimeType });
    return URL.createObjectURL(blob);
  }

  $effect(() => {
    let cancelled = false;
    let u1: string | null = null;
    let u2: string | null = null;
    
    originalLoading = true;
    currentLoading = true;
    
    Promise.all([
      loadImage(originalRevision),
      loadImage(currentRevision)
    ]).then(([src1, src2]) => {
      if (cancelled) {
        if (src1) URL.revokeObjectURL(src1);
        if (src2) URL.revokeObjectURL(src2);
        return;
      }
      u1 = src1;
      u2 = src2;
      originalSrc = src1;
      currentSrc = src2;
      originalLoading = false;
      currentLoading = false;
    });

    return () => {
      cancelled = true;
      if (u1) URL.revokeObjectURL(u1);
      if (u2) URL.revokeObjectURL(u2);
    };
  });

  function handleZoomIn() { zoom = Math.min(zoom * 1.25, 50); }
  function handleZoomOut() { zoom = Math.max(zoom / 1.25, 0.05); }

  function handleClick() {
    if (isCtrlPressed) handleZoomOut();
    else handleZoomIn();
  }

  function handleWheel(e: WheelEvent) {
    if (e.ctrlKey) {
      e.preventDefault();
      if (e.deltaY < 0) handleZoomIn();
      else handleZoomOut();
    }
  }
</script>

<svelte:window 
  onkeydown={(e) => { if (e.key === 'Control') isCtrlPressed = true; }} 
  onkeyup={(e) => { if (e.key === 'Control') isCtrlPressed = false; }} 
  onblur={() => { isCtrlPressed = false; }}
/>

<div class="flex flex-col w-full h-full bg-canvas text-primary">
  <div class="flex items-stretch bg-surface-1 border-b border-border text-xs shrink-0 select-none">
    <div class="flex-1 flex items-center px-4 py-2 border-r border-border truncate justify-center font-medium opacity-70">
      {originalLabel || 'Original'}
    </div>
    <div class="flex-1 flex items-center px-4 py-2 truncate justify-center font-medium opacity-70">
      {currentLabel || 'Modified'}
    </div>
  </div>
  
  <div class="flex-1 flex overflow-hidden relative">
    <div class="flex-1 flex items-center justify-center overflow-auto p-4 border-r border-border"
         onwheel={handleWheel}
         onclick={handleClick}
         style="cursor: {isCtrlPressed ? 'zoom-out' : 'zoom-in'};"
         role="presentation">
      {#if originalLoading}
        <!-- Blank -->
      {:else if originalSrc}
        <img src={originalSrc} alt="original" style="transform: scale({zoom}); transform-origin: center center; transition: transform 0.15s ease-out; background-color: var(--bg-active); background-image: conic-gradient(var(--bg-surface-2) 90deg, transparent 90deg 180deg, var(--bg-surface-2) 180deg 270deg, transparent 270deg); background-size: 20px 20px;" class="max-w-none pointer-events-none select-none" />
      {:else}
        <span class="text-muted">No Image</span>
      {/if}
    </div>

    <div class="flex-1 flex items-center justify-center overflow-auto p-4"
         onwheel={handleWheel}
         onclick={handleClick}
         style="cursor: {isCtrlPressed ? 'zoom-out' : 'zoom-in'};"
         role="presentation">
      {#if currentLoading}
        <!-- Blank -->
      {:else if currentSrc}
        <img src={currentSrc} alt="modified" style="transform: scale({zoom}); transform-origin: center center; transition: transform 0.15s ease-out; background-color: var(--bg-active); background-image: conic-gradient(var(--bg-surface-2) 90deg, transparent 90deg 180deg, var(--bg-surface-2) 180deg 270deg, transparent 270deg); background-size: 20px 20px;" class="max-w-none pointer-events-none select-none" />
      {:else}
        <span class="text-muted">No Image</span>
      {/if}
    </div>
  </div>
</div>
