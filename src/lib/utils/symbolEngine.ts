/**
 * Symbol Engine
 *
 * Utility helpers for symbol engine.
 */

import { invoke } from '@tauri-apps/api/core';

export interface SymbolLocation {
  file_path: string;
  line: number;
  column: number;
  name: string;
  kind: SymbolKind;
  parent: string | null;
}

export type SymbolKind =
  | 'Function' | 'Method' | 'Struct' | 'Class' | 'Trait'
  | 'Enum' | 'Interface' | 'Variable' | 'Constant'
  | 'Type' | 'Module' | 'Macro' | 'Constructor';

export interface ReferenceLocation {
  file_path: string;
  line: number;
  column: number;
  text: string;
}

export interface IndexStats {
  total_files: number;
  total_symbols: number;
  languages: string[];
}

export async function indexWorkspace(root: string): Promise<IndexStats> {
  return invoke<IndexStats>('index_workspace', { root });
}

export async function getSymbolIndex(root: string): Promise<Record<string, SymbolLocation[]>> {
  return invoke<Record<string, SymbolLocation[]>>('get_symbol_index', { root });
}

export async function gotoDefinition(root: string, symbol: string, currentFile: string): Promise<SymbolLocation[]> {
  return invoke<SymbolLocation[]>('goto_definition', { root, symbol, currentFile });
}

export async function findReferences(root: string, symbol: string): Promise<ReferenceLocation[]> {
  return invoke<ReferenceLocation[]>('find_references', { root, symbol });
}

export async function renameSymbol(root: string, symbol: string, newName: string, currentFile: string): Promise<number> {
  return invoke<number>('rename_symbol', { root, symbol, newName, currentFile });
}

export type { SymbolKind as SymbolKindType };
