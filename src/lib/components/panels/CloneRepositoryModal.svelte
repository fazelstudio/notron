<!--
 * Clone Repository Modal
 *
 * Dialog for cloning a git repository into a local folder.
-->

<script lang="ts">
  import { eventBus } from '../../utils/eventBus';
  import { uiStore } from '../../stores/ui';
  import { cloneRepository, type GitProgress } from '../../services/git';
  import { open } from '@tauri-apps/plugin-dialog';
  import Modal from '../common/Modal.svelte';

  const ui = uiStore;
  let isOpen = $derived($ui.isCloneRepositoryModalOpen);
  let cloneStatus = $derived($ui.cloneStatus);

  let repoUrl = $state('');
  let destPath = $state('');
  let cloning = $state(false);
  let progress = $state<GitProgress | null>(null);

  function repoNameFromUrl(url: string): string {
    const cleaned = url.trim().replace(/\/+$/, '');
    const base = cleaned.split('?')[0].split('/').pop() || 'repository';
    return base.replace(/\.git$/i, '');
  }

  /**
   * Accept and normalize the URL the user typed. Supports:
   *   - https://github.com/user/repo(.git)
   *   - github.com/user/repo(.git)        (no scheme)
   *   - user/repo(.git)                   (GitHub shorthand)
   *   - git@host:user/repo(.git) or any URL with a scheme
   * Returns '' when the input is not a valid repository URL.
   */
  function normalizeRepoUrl(url: string): string {
    const u = url.trim();
    if (!u) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u) || /^[^@\s]+@[^:\s]+:.+/.test(u)) {
      return u;
    }
    if (/^(www\.)?github\.com\//i.test(u)) {
      return `https://${u}`;
    }
    const segments = u.split('/');
    if (segments.length === 2 && segments.every(s => /^[a-zA-Z0-9_.-]+$/.test(s))) {
      return `https://github.com/${segments[0]}/${segments[1]}`;
    }
    return '';
  }

  function isValidRepoUrl(url: string): boolean {
    return normalizeRepoUrl(url) !== '';
  }

  function reset() {
    repoUrl = '';
    destPath = '';
    progress = null;
  }

  function handleClose() {
    uiStore.closeCloneRepositoryModal();
    if (!cloning) reset();
  }

  async function handleBrowse() {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        destPath = selected.replace(/[\\/]+$/, '');
      }
    } catch (err) { console.error('Failed to pick folder:', err); }
  }

  async function handleClone() {
    if (cloning) return;
    const url = normalizeRepoUrl(repoUrl);
    const parent = destPath.trim();
    if (!url || !parent) return;

    const name = repoNameFromUrl(url);
    const target = `${parent}/${name}`;
    const opId = `clone-${name}-${Date.now()}`;
    cloning = true;
    progress = null;
    uiStore.setCloneStatus({ name, opId });

    try {
      await cloneRepository(url, target, opId, (p) => { progress = p; });
      uiStore.clearCloneStatus();
      uiStore.removeProcessToast();
      uiStore.closeCloneRepositoryModal();
      uiStore.addToast('Clone Repository', 'success', `Successfully cloned ${name}`);
      eventBus.emit('request-workspace-switch', { path: target });
      reset();
    } catch (e) {
      const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
      uiStore.clearCloneStatus();
      uiStore.removeProcessToast();
      uiStore.closeCloneRepositoryModal();
      uiStore.addToast('Clone Failed', 'alert', msg);
      reset();
    }
  }
</script>

<Modal {isOpen} title="Clone Repository" onClose={handleClose} widthClass="max-w-md">
  <div class="p-2 flex flex-col gap-2">
    <div class="flex flex-col gap-1">
      <span class="text-xs text-muted">Repository URL</span>
      <input
        type="url"
        bind:value={repoUrl}
        placeholder="https://github.com/user/repo.git"
        disabled={cloning}
        spellcheck="false"
        class="w-full text-xs px-2 h-[var(--nt-control-height)] rounded-[2px] border border-subtle bg-surface-3 text-primary placeholder:text-muted outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
        onkeydown={(e) => { if (e.key === 'Enter') handleClone(); }}
      />
    </div>

    <div class="flex flex-col gap-1">
      <span class="text-xs text-muted">Parent folder</span>
      <div class="flex gap-1.5">
        <input
          type="text"
          bind:value={destPath}
          placeholder="C:\Users\you\Projects"
          disabled={cloning}
          spellcheck="false"
          class="flex-1 min-w-0 text-xs px-2 h-[var(--nt-control-height)] rounded-[2px] border border-subtle bg-surface-3 text-primary placeholder:text-muted outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onclick={handleBrowse}
          disabled={cloning}
          class="shrink-0 nt-control border border-subtle bg-surface-2 hover:bg-hover text-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >Browse</button>
      </div>
      {#if destPath && isValidRepoUrl(repoUrl)}
        <span class="text-xs text-muted break-all">
          Will clone into: {destPath}\{repoNameFromUrl(repoUrl)}
        </span>
      {/if}
    </div>

    {#if cloning}
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2 text-xs text-primary">
          <svg class="animate-spin shrink-0 text-accent" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
          <span class="truncate">{progress?.message || `Cloning repository ${cloneStatus?.name ?? ''}...`}</span>
        </div>
        <div class="w-full h-1 rounded-full bg-surface-3 overflow-hidden">
          {#if progress?.percent != null}
            <div class="h-full bg-accent" style="width: {progress.percent}%"></div>
          {:else}
            <div class="h-full w-1/3 bg-accent rounded-full animate-pulse"></div>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <div class="flex justify-end gap-2 w-full">
      <button
        onclick={handleClose}
        disabled={cloning}
        class="nt-control bg-surface-2 hover:bg-hover text-primary border border-subtle disabled:opacity-50 disabled:cursor-not-allowed"
      >Cancel</button>
      <button
        onclick={handleClone}
        disabled={cloning || !isValidRepoUrl(repoUrl) || !destPath.trim()}
        class="nt-control bg-accent hover:bg-accent-hover text-on-accent border border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
      >Clone It</button>
    </div>
  {/snippet}
</Modal>
