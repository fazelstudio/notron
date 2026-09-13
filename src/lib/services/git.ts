/**
 * Git
 *
 * Service for git.
 */

import { Channel, invoke } from '@tauri-apps/api/core';

// Types mirror src-tauri/src/git_service.rs

export interface GitFileStatus {
  path: string;
  status: string; // U, M, D, A, R, C, Conflict
  staged: boolean;
}

export interface GitStatusResult {
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  branch: string;
}

export interface GitAvailability {
  status: string; // "Unknown" | "Checking" | "Available" | "NotFound"
  path: string | null;
  version: string | null;
  source: string; // "manual" | "path" | "common" | "registry" | "xcode"
}

export interface RepoState {
  status: string; // "Unknown" | "Checking" | "NotARepo" | "Repo"
  branch: string | null;
  has_upstream: boolean;
  /** Full upstream ref, e.g. "origin/main". */
  upstream?: string | null;
  /** Remote name of the upstream, e.g. "origin". */
  upstream_remote?: string | null;
  ahead: number;
  behind: number;
  /** Short (8-char) HEAD commit hash; null when the branch is unborn. */
  head_short?: string | null;
  /** True when the current branch has no commit yet (freshly initialized repo). */
  unborn?: boolean;
  merge_in_progress?: boolean;
  rebase_in_progress?: boolean;
  cherry_pick_in_progress?: boolean;
  remotes?: string[];
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
  conflicted: GitFileStatus[];
  last_fetched_ms: number | null;
  remote_url: string | null;
}

export interface GitProgress {
  phase: string;
  percent: number | null;
  message: string;
  done: boolean;
}

export interface GitLogEntry {
  hash: string;
  message: string;
  author: string;
  email: string;
  date: string;
  refs: string;
  /** Raw parent hashes (space-separated, `%P`). Empty for the root commit. */
  parents: string;
  stats: string;
}

export const UNKNOWN_AVAILABILITY: GitAvailability = {
  status: 'Unknown',
  path: null,
  version: null,
  source: '',
};

export async function getGitAvailability(): Promise<GitAvailability> {
  try {
    return await invoke<GitAvailability>('get_git_availability');
  } catch {
    return UNKNOWN_AVAILABILITY;
  }
}

export async function checkGitInstalled(): Promise<boolean> {
  try {
    const avail = await invoke<GitAvailability>('check_git_availability', { manualPath: null });
    return avail.status === 'Available';
  } catch {
    return false;
  }
}

export async function reDetectGit(): Promise<GitAvailability> {
  return await invoke<GitAvailability>('re_detect_git');
}

export async function setGitManualPath(path: string): Promise<GitAvailability> {
  return await invoke<GitAvailability>('set_git_manual_path', { path });
}

export async function getRepoState(cwd: string): Promise<RepoState> {
  return await invoke<RepoState>('get_repo_state', { cwd });
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  if (!cwd) return false;
  try {
    const state = await invoke<RepoState>('get_repo_state', { cwd });
    return state.status === 'Repo';
  } catch {
    return false;
  }
}

export async function getGitStatus(cwd: string): Promise<GitStatusResult> {
  if (!cwd) return { staged: [], unstaged: [], branch: '' };
  try {
    const state = await invoke<RepoState>('get_repo_state', { cwd });
    return {
      staged: state.staged,
      unstaged: state.unstaged, // backend already includes untracked in unstaged
      branch: state.branch || '',
    };
  } catch (err) {
    console.error('Failed to get git status:', err);
    return { staged: [], unstaged: [], branch: '' };
  }
}

export async function initRepo(cwd: string): Promise<void> {
  await invoke('git_init', { cwd });
}

export async function stageFile(cwd: string, path: string): Promise<void> {
  await invoke('git_stage', { cwd, path });
}

export async function stageAll(cwd: string): Promise<void> {
  await invoke('git_stage', { cwd, path: '.' });
}

export async function unstageFile(cwd: string, path: string): Promise<void> {
  await invoke('git_unstage', { cwd, path });
}

export async function unstageAll(cwd: string): Promise<void> {
  await invoke('git_unstage', { cwd, path: '.' });
}

export async function commit(cwd: string, message: string): Promise<void> {
  await invoke('git_commit', { cwd, message });
}

export async function discardFile(cwd: string, path: string): Promise<void> {
  await invoke('git_discard', { cwd, path });
}

export interface ProgressHandle {
  promise: Promise<void>;
  opId: string;
  cancel: () => Promise<void>;
}

/**
 * Run a network git operation (push/pull/fetch) with real-time progress from
 * the child process and true cancellation. `onProgress` is invoked for every
 * progress message, and the final call has `done: true`.
 */
export function runNetworkOp(
  command: 'git_push' | 'git_pull' | 'git_fetch',
  cwd: string,
  opId: string | null,
  onProgress: (p: GitProgress) => void,
): ProgressHandle {
  const channel = new Channel<GitProgress>();
  channel.onmessage = onProgress;

  const promise = invoke(command, { cwd, opId, progress: channel }) as Promise<void>;
  return {
    promise,
    opId: opId ?? '',
    cancel: async () => {
      if (opId) await invoke('git_cancel_op', { opId });
    },
  };
}

export async function push(cwd: string): Promise<void> {
  await invoke('git_push', { cwd });
}

/** the editor "Publish Branch": push the current branch and set its upstream. */
export function publishBranch(
  cwd: string,
  opId: string | null,
  onProgress: (p: GitProgress) => void,
): ProgressHandle {
  const channel = new Channel<GitProgress>();
  channel.onmessage = onProgress;

  const promise = invoke('git_publish', { cwd, opId, progress: channel }) as Promise<void>;
  return {
    promise,
    opId: opId ?? '',
    cancel: async () => {
      if (opId) await invoke('git_cancel_op', { opId });
    },
  };
}

export async function pull(cwd: string): Promise<void> {
  await invoke('git_pull', { cwd });
}

export async function fetchRepo(cwd: string, opId: string | null, onProgress: (p: GitProgress) => void): Promise<void> {
  const channel = new Channel<GitProgress>();
  channel.onmessage = onProgress;
  await invoke('git_fetch', { cwd, opId, progress: channel });
}

/**
 * Clone a repository from `url` into `dest` with real-time progress and
 * cancel support, mirroring `runNetworkOp` for push/pull/fetch.
 */
export function cloneRepository(
  url: string,
  dest: string,
  opId: string | null,
  onProgress: (p: GitProgress) => void,
): ProgressHandle {
  const channel = new Channel<GitProgress>();
  channel.onmessage = onProgress;

  const promise = invoke('git_clone', { url, dest, opId, progress: channel }) as Promise<void>;
  return {
    promise,
    opId: opId ?? '',
    cancel: async () => {
      if (opId) await invoke('git_cancel_op', { opId });
    },
  };
}

export async function cancelOp(opId: string): Promise<void> {
  await invoke('git_cancel_op', { opId });
}

export async function getGitLog(cwd: string, limit: number = 50, offset: number = 0): Promise<GitLogEntry[]> {
  if (!cwd) return [];
  try {
    return await invoke<GitLogEntry[]>('git_log', { cwd, limit, offset });
  } catch (err) {
    console.error('Failed to get git log:', err);
    return [];
  }
}

export async function getCommitFiles(cwd: string, hash: string): Promise<GitFileStatus[]> {
  try {
    return await invoke<GitFileStatus[]>('get_commit_files', { cwd, hash });
  } catch {
    return [];
  }
}

export async function getGitFileContent(cwd: string, path: string, revision: string = "HEAD"): Promise<string | null> {
  if (!cwd || !path) return null;
  try {
    return await invoke<string>('get_git_file_content', { cwd, path, revision });
  } catch (err) {
    const msg = String(err);
    // Don't log error for new files not in HEAD yet
    if (!msg.includes('exists on disk, but not in') && !msg.includes('not in HEAD') && !msg.includes('pathspec') && !msg.includes('did not match any file(s) known to git')) {
      console.error('Failed to get git file content:', err);
    }
    return null;
  }
}

export async function getGitFileBinary(cwd: string, path: string, revision: string = "HEAD"): Promise<number[] | null> {
  if (!cwd || !path) return null;
  try {
    return await invoke<number[]>('get_git_file_binary', { cwd, path, revision });
  } catch (err) {
    const msg = String(err);
    // Don't log error for new files not in HEAD yet
    if (!msg.includes('exists on disk, but not in') && !msg.includes('not in HEAD') && !msg.includes('pathspec') && !msg.includes('did not match any file(s) known to git')) {
      console.error('Failed to get git file binary:', err);
    }
    return null;
  }
}

export async function getGitFileDiff(cwd: string, path: string): Promise<string> {
  if (!cwd || !path) return "";
  try {
    return await invoke<string>('git_file_diff', { cwd, path });
  } catch (err) {
    console.warn('Failed to get git file diff:', err);
    return "";
  }
}
