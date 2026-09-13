/**
 * Default Icon Theme
 *
 * Lucide icons for default theme.
 */

import { File, FileCode, FileJson, FileText, Image, Settings, Globe, Hash } from 'lucide-svelte';

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
