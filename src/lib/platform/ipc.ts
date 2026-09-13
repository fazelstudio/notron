/**
 * IPC Catalog
 *
 * Typed helpers for Tauri commands. Centralizes command names and payloads.
 */

import { invoke } from '@tauri-apps/api/core';
import type { FileNode, FileMetadata, ChunkedFileResult, FileEncodingInfo, DirBatchEntry } from '../services/fileService';

// File
export const fileIpc = {
  readText: (path: string) => invoke<string>('read_file_text', { path }),
  readChunked: (path: string) => invoke<ChunkedFileResult>('read_file_chunked', { path }),
  save: (path: string, content: string, encoding?: string) => invoke<void>('save_file', { path, content, encoding }),
  readDirectory: (path: string, showDotFiles?: boolean) => invoke<FileNode>('read_directory', { path, showDotFiles }),
  readDirectoryFlat: (path: string, showDotFiles?: boolean) => invoke<FileNode[]>('read_directory_flat', { path, showDotFiles }),
  readDirectoryBatch: (paths: string[], showDotFiles?: boolean) => invoke<DirBatchEntry[]>('read_directory_batch', { paths, showDotFiles }),
  getFilesMetadata: (paths: string[]) => invoke<FileMetadata[]>('get_files_metadata', { paths }),
  batchReadFiles: (paths: string[]) => invoke<Record<string, string | null>>('batch_read_files', { paths }),
  getEncodingInfo: (path: string) => invoke<FileEncodingInfo>('get_file_encoding_info', { path }),
  detectLanguage: (path: string) => invoke<string>('detect_language', { path }),
  createFile: (path: string) => invoke<void>('create_file', { path }),
  createDirectory: (path: string) => invoke<void>('create_directory', { path }),
  renameItem: (oldPath: string, newPath: string) => invoke<void>('rename_item', { oldPath, newPath }),
  renameItems: (moves: Array<{ oldPath: string; newPath: string }>) =>
    invoke<void>('rename_items', { moves: moves.map((m) => ({ old_path: m.oldPath, new_path: m.newPath })) }),
  deleteItem: (path: string) => invoke<void>('delete_item', { path }),
  deleteItems: (paths: string[]) => invoke<void>('delete_items', { paths }),
  copyItem: (srcPath: string, dstPath: string) => invoke<void>('copy_item', { srcPath, dstPath }),
  copyItems: (copies: Array<{ sourcePath: string; destPath: string }>) =>
    invoke<void>('copy_items', { copies: copies.map((c) => ({ source_path: c.sourcePath, dest_path: c.destPath })) }),
  fileExists: (path: string) => invoke<boolean>('file_exists', { path }),
  listAllFiles: (path: string, excludeDirs?: string[], maxResults?: number) =>
    invoke<string[]>('list_all_files', { path, excludeDirs, maxResults })
};

// Settings / DB
export const settingsIpc = {
  loadGlobal: () => invoke<Record<string, any>>('load_global_settings'),
  loadWorkspace: (workspaceId: string) => invoke<Record<string, any>>('load_workspace_settings', { workspaceId }),
  saveGlobal: (key: string, value: any) => invoke<void>('save_global_setting', { key, value }),
  saveWorkspace: (workspaceId: string, key: string, value: any) =>
    invoke<void>('save_workspace_setting', { workspaceId, key, value }),
  deleteWorkspace: (workspaceId: string, key: string) => invoke<void>('delete_workspace_setting', { workspaceId, key })
};

// Startup
export interface StartupState {
  config: any;
  critical: any;
  ui_state: any | null;
  session_pairs: [string, string][];
  global_settings: Record<string, any>;
  workspace_settings: Record<string, any>;
  crash_flag: boolean;
}

export const startupIpc = {
  load: (workspaceId: string | null) => invoke<StartupState>('load_startup_state', { workspaceId }),
  recordTimer: (name: string) => invoke<void>('record_startup_timer', { name }),
  showMainWindow: () => invoke<void>('show_main_window'),
  openNewWindow: () => invoke<void>('open_new_window')
};

// Git
export const gitIpc = {
  getAvailability: () => invoke<any>('get_git_availability'),
  checkAvailability: (manualPath: string | null) => invoke<any>('check_git_availability', { manualPath }),
  reDetect: () => invoke<any>('re_detect_git'),
  setManualPath: (path: string) => invoke<any>('set_git_manual_path', { path }),
  getRepoState: (cwd: string) => invoke<any>('get_repo_state', { cwd }),
  stage: (cwd: string, path: string) => invoke<void>('git_stage', { cwd, path }),
  unstage: (cwd: string, path: string) => invoke<void>('git_unstage', { cwd, path }),
  commit: (cwd: string, message: string) => invoke<void>('git_commit', { cwd, message }),
  discard: (cwd: string, path: string) => invoke<void>('git_discard', { cwd, path })
};

// Workspace / Cache / Watcher
export const workspaceIpc = {
  startWatch: (root: string) => invoke<void>('start_fs_watch', { root }),
  stopWatch: (root: string) => invoke<void>('stop_fs_watch', { root }),
  expandFolder: (path: string, showDotFiles?: boolean) => invoke<any>('expand_folder', { path, showDotFiles }),
  getFilesMetadata: (paths: string[]) => invoke<any[]>('get_files_metadata', { paths }),
  batchReadFiles: (paths: string[]) => invoke<Record<string, string | null>>('batch_read_files', { paths }),
  readChunked: (path: string) => invoke<any>('read_file_chunked', { path })
};

// System / Window / Session
export const systemIpc = {
  setCrashFlag: (value: boolean) => invoke<void>('set_crash_flag', { value }),
  saveCriticalConfig: (config: any) => invoke<void>('save_critical_config', { config }),
  getDirtySnapshots: () => invoke<any[]>('get_dirty_tab_snapshots'),
  getFilesMetadata: (paths: string[]) => invoke<any[]>('get_files_metadata', { paths }),
  saveFile: (path: string, content: string) => invoke<void>('save_file', { path, content }),
  getGitFileContent: (cwd: string, path: string, revision: string) => invoke<string>('get_git_file_content', { cwd, path, revision }),
  openNewWindow: () => invoke<void>('open_new_window'),
  showMainWindow: () => invoke<void>('show_main_window')
};