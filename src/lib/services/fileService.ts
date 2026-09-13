/**
 * File Service
 *
 * Abstraction over file system access. UI depends on the interface,
 * the default implementation calls Tauri.
 */

import { invoke } from '@tauri-apps/api/core';

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  has_children: boolean;
  children?: FileNode[] | null;
  is_ignored?: boolean;
}

export interface FileMetadata {
  path: string;
  size: number;
  modified?: number | null;
  is_dir: boolean;
}

export interface ChunkedFileResult {
  content: string;
  total_size: number;
  is_complete: boolean;
  disable_highlight: boolean;
}

export interface FileEncodingInfo {
  encoding: string;
  line_ending: string;
}

export interface DirBatchEntry {
  path: string;
  children: FileNode[];
}

export interface IFileService {
  readText(path: string): Promise<string>;
  readChunked(path: string): Promise<ChunkedFileResult>;
  save(path: string, content: string, encoding?: string): Promise<void>;
  readDirectory(path: string, showDotFiles?: boolean): Promise<FileNode>;
  readDirectoryFlat(path: string, showDotFiles?: boolean): Promise<FileNode[]>;
  readDirectoryBatch(paths: string[], showDotFiles?: boolean): Promise<DirBatchEntry[]>;
  getFilesMetadata(paths: string[]): Promise<FileMetadata[]>;
  batchReadFiles(paths: string[]): Promise<Record<string, string | null>>;
  getEncodingInfo(path: string): Promise<FileEncodingInfo>;
  detectLanguage(path: string): Promise<string>;
  createFile(path: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
  renameItem(oldPath: string, newPath: string): Promise<void>;
  renameItems(moves: Array<{ oldPath: string; newPath: string }>): Promise<void>;
  deleteItem(path: string): Promise<void>;
  deleteItems(paths: string[]): Promise<void>;
  copyItem(srcPath: string, dstPath: string): Promise<void>;
  copyItems(copies: Array<{ sourcePath: string; destPath: string }>): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  listAllFiles(path: string, excludeDirs?: string[], maxResults?: number): Promise<string[]>;
}

class TauriFileService implements IFileService {
  readText(path: string): Promise<string> {
    return invoke<string>('read_file_text', { path });
  }
  readChunked(path: string): Promise<ChunkedFileResult> {
    return invoke<ChunkedFileResult>('read_file_chunked', { path });
  }
  save(path: string, content: string, encoding?: string): Promise<void> {
    return invoke('save_file', { path, content, encoding });
  }
  readDirectory(path: string, showDotFiles = false): Promise<FileNode> {
    return invoke<FileNode>('read_directory', { path, showDotFiles });
  }
  readDirectoryFlat(path: string, showDotFiles = false): Promise<FileNode[]> {
    return invoke<FileNode[]>('read_directory_flat', { path, showDotFiles });
  }
  readDirectoryBatch(paths: string[], showDotFiles = false): Promise<DirBatchEntry[]> {
    return invoke<DirBatchEntry[]>('read_directory_batch', { paths, showDotFiles });
  }
  getFilesMetadata(paths: string[]): Promise<FileMetadata[]> {
    return invoke<FileMetadata[]>('get_files_metadata', { paths });
  }
  batchReadFiles(paths: string[]): Promise<Record<string, string | null>> {
    return invoke<Record<string, string | null>>('batch_read_files', { paths });
  }
  getEncodingInfo(path: string): Promise<FileEncodingInfo> {
    return invoke<FileEncodingInfo>('get_file_encoding_info', { path });
  }
  detectLanguage(path: string): Promise<string> {
    return invoke<string>('detect_language', { path });
  }
  createFile(path: string): Promise<void> {
    return invoke('create_file', { path });
  }
  createDirectory(path: string): Promise<void> {
    return invoke('create_directory', { path });
  }
  renameItem(oldPath: string, newPath: string): Promise<void> {
    return invoke('rename_item', { oldPath, newPath });
  }
  renameItems(moves: Array<{ oldPath: string; newPath: string }>): Promise<void> {
    return invoke('rename_items', {
      moves: moves.map((m) => ({ old_path: m.oldPath, new_path: m.newPath }))
    });
  }
  deleteItem(path: string): Promise<void> {
    return invoke('delete_item', { path });
  }
  deleteItems(paths: string[]): Promise<void> {
    return invoke('delete_items', { paths });
  }
  copyItem(srcPath: string, dstPath: string): Promise<void> {
    return invoke('copy_item', { srcPath, dstPath });
  }
  copyItems(copies: Array<{ sourcePath: string; destPath: string }>): Promise<void> {
    return invoke('copy_items', {
      copies: copies.map((c) => ({ source_path: c.sourcePath, dest_path: c.destPath }))
    });
  }
  fileExists(path: string): Promise<boolean> {
    return invoke<boolean>('file_exists', { path });
  }
  listAllFiles(path: string, excludeDirs?: string[], maxResults?: number): Promise<string[]> {
    return invoke<string[]>('list_all_files', { path, excludeDirs, maxResults });
  }
}

export const fileService: IFileService = new TauriFileService();

/** For additional DI / testing: allow swapping implementation */
let current: IFileService = fileService;
export function getFileService(): IFileService {
  return current;
}
export function setFileService(svc: IFileService): void {
  current = svc;
}