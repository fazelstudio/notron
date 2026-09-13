<script lang="ts">
  import type { Snippet } from 'svelte';
  
  let { 
    isOpen, 
    title, 
    onClose, 
    widthClass = 'max-w-md',
    heightClass = '',
    children, 
    footer 
  }: { 
    isOpen: boolean; 
    title: string; 
    onClose: () => void; 
    widthClass?: string;
    heightClass?: string;
    children: Snippet; 
    footer?: Snippet 
  } = $props();
</script>

{#if isOpen}
  <div class="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--nt-editor-bg)]/50 backdrop-blur-sm" role="presentation">
    <div
      class="w-full {widthClass} {heightClass} rounded-lg flex flex-col border bg-[var(--nt-overlay-bg)] border-[var(--nt-overlay-border)] text-[var(--nt-overlay-fg)] overflow-hidden"
      style="box-shadow: var(--nt-overlay-shadow);"
      role="dialog"
      tabindex="0"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div class="flex items-center justify-between p-3 border-b border-[var(--nt-overlay-border)] shrink-0">
        <h2 class="text-sm font-semibold text-[var(--nt-overlay-fg)]">{title}</h2>
        <button aria-label="Close" onclick={onClose} class="text-[var(--nt-prim-fg-subtle)] hover:text-[var(--nt-overlay-fg)] transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto">
        {@render children()}
      </div>
      {#if footer}
        <div class="p-3 border-t border-[var(--nt-overlay-border)] bg-[var(--nt-overlay-bg)] shrink-0">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
