<script lang="ts">
  import { onMount, untrack } from 'svelte';

  let { content = '', customContent, side = 'top', wrapperClass = '', followCursor = false, hoverDelay = 0, disabled = false, unstyled = false, pointerEvents = false, children }: { content?: string; customContent?: import('svelte').Snippet; side?: 'top' | 'bottom' | 'left' | 'right'; wrapperClass?: string; followCursor?: boolean; hoverDelay?: number; disabled?: boolean; unstyled?: boolean; pointerEvents?: boolean; children: import('svelte').Snippet } = $props();
  let visible = $state(false);
  let coords = $state({ x: 0, y: 0 });
  let tooltipElement = $state<HTMLDivElement>();
  let positionFrame: number | undefined;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let pointer = { x: 0, y: 0 };
  let cancelled = false;
  let anchorRect = $state<DOMRect>();
  let measured = $state(false);
  let anchorEl = $state<HTMLDivElement>();
  let anchorObserver: MutationObserver | undefined;

  const CURSOR_GAP = 6;
  const VIEWPORT_GAP = 6;

  function portal(node: HTMLElement) {
    document.body.appendChild(node);

    // A popover is rendered in the browser's top layer, above the editor and
    // every stacking context. Older webviews still get the z-index fallback.
    if (typeof node.showPopover === 'function') {
      node.showPopover();
    }

    return {
      destroy() {
        if (typeof node.hidePopover === 'function' && node.matches(':popover-open')) {
          node.hidePopover();
        }
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    };
  }
  
  function handleMouseEnter(e: MouseEvent) {
    cancelled = false;
    pointer = { x: e.clientX, y: e.clientY };

    if (disabled) return;

    if (!followCursor) {
      anchorRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const rect = anchorRect;
      if (side === 'top') {
        coords = { x: rect.left + rect.width / 2, y: rect.top - 4 };
      } else if (side === 'bottom') {
        coords = { x: rect.left + rect.width / 2, y: rect.bottom + 4 };
      } else if (side === 'left') {
        coords = { x: rect.left - 4, y: rect.top + rect.height / 2 };
      } else if (side === 'right') {
        coords = { x: rect.right + 4, y: rect.top + rect.height / 2 };
      }
    }

    measured = false;
    scheduleShow();
  }

  function scheduleShow() {
    if (disabled || cancelled) return;
    if (showTimer !== undefined) clearTimeout(showTimer);

    if (hoverDelay > 0) {
      showTimer = setTimeout(() => {
        showTimer = undefined;
        visible = true;
        if (followCursor) positionAtCursor(pointer.x, pointer.y);
        else positionAtAnchor();
      }, hoverDelay);
    } else {
      visible = true;
      if (followCursor) positionAtCursor(pointer.x, pointer.y);
      else positionAtAnchor();
    }
  }

  function handleMouseMove(e: MouseEvent) {
    pointer = { x: e.clientX, y: e.clientY };

    // Before appearing, the delay represents pointer idle time. Once shown,
    // keep the tooltip anchored where it first appeared.
    if (!visible && hoverDelay > 0) {
      scheduleShow();
    }
  }

  function handleContextMenu() {
    cancelled = true;
    hide();
  }

  function handleMouseLeave() {
    hide();
    cancelled = false;
  }

  function positionAtCursor(cursorX: number, cursorY: number) {
    if (positionFrame !== undefined) cancelAnimationFrame(positionFrame);

    positionFrame = requestAnimationFrame(() => {
      positionFrame = undefined;
      if (!tooltipElement) return;

      const rect = tooltipElement.getBoundingClientRect();
      const maxLeft = Math.max(VIEWPORT_GAP, window.innerWidth - rect.width - VIEWPORT_GAP);
      const maxTop = Math.max(VIEWPORT_GAP, window.innerHeight - rect.height - VIEWPORT_GAP);

      // Prefer the requested anchor: the tooltip's bottom-left corner sits
      // just above and to the right of the pointer.
      const left = Math.min(Math.max(cursorX + CURSOR_GAP, VIEWPORT_GAP), maxLeft);
      let top = cursorY - rect.height - CURSOR_GAP;

      // Flip below the pointer only when there is not enough room above it.
      if (top < VIEWPORT_GAP) top = cursorY + CURSOR_GAP;

      coords = {
        x: left,
        y: Math.min(Math.max(top, VIEWPORT_GAP), maxTop)
      };
      measured = true;
    });
  }

  function positionAtAnchor() {
    if (positionFrame !== undefined) cancelAnimationFrame(positionFrame);
    positionFrame = requestAnimationFrame(() => {
      positionFrame = undefined;
      if (!tooltipElement || !anchorRect) return;

      const rect = tooltipElement.getBoundingClientRect();
      let newCoords = { ...coords };

      if (rect.left < VIEWPORT_GAP) {
        newCoords.x += (VIEWPORT_GAP - rect.left);
      } else if (rect.right > window.innerWidth - VIEWPORT_GAP) {
        newCoords.x -= (rect.right - (window.innerWidth - VIEWPORT_GAP));
      }

      if (rect.top < VIEWPORT_GAP) {
        newCoords.y += (VIEWPORT_GAP - rect.top);
      } else if (rect.bottom > window.innerHeight - VIEWPORT_GAP) {
        newCoords.y -= (rect.bottom - (window.innerHeight - VIEWPORT_GAP));
      }

      coords = newCoords;
      measured = true;
    });
  }

  function hide() {
    // Remove the native popover from the top layer immediately. Waiting for
    // Svelte's next render makes a context-menu interaction feel delayed.
    if (tooltipElement && typeof tooltipElement.hidePopover === 'function' && tooltipElement.matches(':popover-open')) {
      tooltipElement.hidePopover();
    }
    visible = false;
    if (showTimer !== undefined) {
      clearTimeout(showTimer);
      showTimer = undefined;
    }
    if (positionFrame !== undefined) {
      cancelAnimationFrame(positionFrame);
      positionFrame = undefined;
    }
  }

  $effect(() => {
    if (disabled) {
      untrack(() => hide());
    } else {
      content; // trigger tracking
      cancelled = false; // Reset cancellation if we move to a different item!
      
      untrack(() => {
        // If the user is currently hovering (timer is running or tooltip is visible),
        // we must restart the delay when moving to a new item.
        if (visible || showTimer !== undefined) {
          hide();
          scheduleShow();
        }
      });
    }
  });

  onMount(() => {
    const forceHide = () => hide();
    const forceCancel = () => { cancelled = true; hide(); };
    window.addEventListener('notron:hide-tooltips', forceHide);
    window.addEventListener('notron:cancel-tooltips', forceCancel);
    return () => {
      window.removeEventListener('notron:hide-tooltips', forceHide);
      window.removeEventListener('notron:cancel-tooltips', forceCancel);
    };
  });

  $effect(() => {
    // A tooltip whose anchor is destroyed without firing a mouseleave (e.g.
    // the git gutter peek view being closed) must not linger on screen.
    if (visible && anchorEl) {
      anchorObserver ??= new MutationObserver(() => {
        if (visible && anchorEl && !anchorEl.isConnected) {
          hide();
        }
      });
      anchorObserver.observe(document.body, { childList: true, subtree: true });
      return () => anchorObserver?.disconnect();
    }
  });

  let positionClass = $derived.by(() => {
    const classes: string[] = ['fixed', 'z-[2147483647]', 'm-0', 'max-w-[calc(100vw-12px)]'];
    
    if (unstyled) {
      // Just positioning classes
    } else {
      classes.push('px-2', 'py-1', 'text-[10px]', 'rounded', 'shadow-elevated', 'bg-elevated', 'border', 'border-subtle', 'text-primary');
    }
    
    if (!pointerEvents) {
      classes.push('pointer-events-none');
    } else {
      classes.push('pointer-events-auto');
    }
    
    if (!followCursor) {
      classes.push('whitespace-nowrap');
      if (side === 'bottom') classes.push('-translate-x-1/2');
      else if (side === 'top') classes.push('-translate-x-1/2', '-translate-y-full');
      else if (side === 'left') classes.push('-translate-x-full', '-translate-y-1/2');
      else if (side === 'right') classes.push('-translate-y-1/2');
    } else {
      classes.push('break-all');
    }
    return classes.join(' ');
  });
</script>

<div
  bind:this={anchorEl}
  class="relative inline-flex {wrapperClass}"
  role="presentation"
  onmouseenter={handleMouseEnter}
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  oncontextmenucapture={handleContextMenu}
>
  {@render children()}
  {#if visible}
    <div
      bind:this={tooltipElement}
      use:portal
      popover="manual"
      role="tooltip"
      class={positionClass}
      style="inset: auto; left: {coords.x}px; top: {coords.y}px; position: fixed; margin: 0; z-index: 2147483647; opacity: {measured ? 1 : 0};"
      onmouseenter={() => {
        if (pointerEvents) {
          if (showTimer) clearTimeout(showTimer);
          cancelled = false;
        }
      }}
      onmouseleave={() => {
        if (pointerEvents) handleMouseLeave();
      }}
    >
      {#if customContent}
        {@render customContent()}
      {:else}
        {content}
      {/if}
    </div>
  {/if}
</div>
