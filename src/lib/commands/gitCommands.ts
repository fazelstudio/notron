/**
 * Git Commands
 *
 * Registers git/source-control panel commands.
 * All git UI triggers go through commandRegistry.
 */

import { commandRegistry } from './registry';
import { gitRepoStore } from '../stores/gitRepo';
import { uiStore } from '../stores/ui';
import { terminalStore } from '../stores/terminal';

function reg(id: string, label: string, category: string, action: (...args:any[])=>any) { if (!commandRegistry.has(id)) commandRegistry.register({ id, label, category, action }); }
reg('git.init', 'Git: Initialize Repository', 'Git', () => gitRepoStore.initRepo());
reg('git.refresh', 'Git: Refresh', 'Git', () => gitRepoStore.refresh());
reg('git.stageAll', 'Git: Stage All Changes', 'Git', () => gitRepoStore.stageAll());
reg('git.unstageAll', 'Git: Unstage All Changes', 'Git', () => gitRepoStore.unstageAll());
reg('git.commit', 'Git: Commit', 'Git', async () => { void window.dispatchEvent(new CustomEvent('git:request-commit')); });
reg('git.push', 'Git: Push', 'Git', async () => {
  const ok = await gitRepoStore.sync('git_push', 'push');
  if (ok) uiStore.addToast('Git Push', 'success', 'Successfully pushed to remote');
});
reg('git.pull', 'Git: Pull', 'Git', async () => {
  const ok = await gitRepoStore.sync('git_pull', 'pull');
  if (ok) uiStore.addToast('Git Pull', 'success', 'Successfully pulled from remote');
});
reg('git.fetch', 'Git: Fetch', 'Git', async () => {
  const ok = await gitRepoStore.sync('git_fetch', 'fetch');
  if (ok) uiStore.addToast('Git Fetch', 'success', 'Fetched from remote');
});
reg('git.publish', 'Git: Publish Branch', 'Git', async () => {
  const ok = await gitRepoStore.publish();
  if (ok) uiStore.addToast('Git Publish', 'success', 'Branch published');
});
reg('git.cancel', 'Git: Cancel Operation', 'Git', () => gitRepoStore.cancelSync());
reg('git.reDetect', 'Git: Re-detect', 'Git', () => gitRepoStore.reDetect());
reg('git.openOutput', 'Git: Show Output', 'Git', () => {
  terminalStore.setActivePanel('output');
  terminalStore.setVisibility(true);
});
reg('git.stage', 'Git: Stage', 'Git', (filePath: string) => {
  if (typeof filePath === 'string') void gitRepoStore.stage(filePath);
});
reg('git.unstage', 'Git: Unstage', 'Git', (filePath: string) => {
  if (typeof filePath === 'string') void gitRepoStore.unstage(filePath);
});
reg('git.discard', 'Git: Discard Changes', 'Git', (filePath: string) => {
  if (typeof filePath === 'string') void gitRepoStore.discard(filePath);
});
