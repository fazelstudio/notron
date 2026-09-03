/**
 * Default (lucide) file icons for the tree and panels. When the material
 * icon theme is active, callers render <MaterialIcon> instead.
 */

import { File, FileCode, FileJson, FileText, Image, Settings, Globe, Hash } from 'lucide-svelte';

import { getMaterialIcon, getMaterialFolderIcon } from './iconMap';

export { getMaterialIcon, getMaterialFolderIcon };

const ICON_MAP: Record<string, any> = {
  ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode,
  rs: FileCode, py: FileCode, go: FileCode,
  html: Globe, css: Hash, json: FileJson,
  md: FileText, svg: Image, png: Image, jpg: Image, jpeg: Image, webp: Image, gif: Image,
  toml: Settings, yaml: Settings, yml: Settings,
};

export function getFileIcon(name: string): any {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ICON_MAP[ext] ?? File;
}
