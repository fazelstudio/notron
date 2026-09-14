/**
 * Vite Config
 *
 * Vite build configuration for the frontend and Tauri dev server.
 */
// @ts-nocheck
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from '@tailwindcss/vite'
// @ts-ignore - node types not in main tsconfig, allowed for vite config
import path from 'node:path'
// @ts-ignore
import { fileURLToPath } from 'node:url'

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [tailwindcss(), svelte()],

  resolve: {
    preserveSymlinks: true,
    // Force a single copy of CodeMirror core for linked and local packages.
    dedupe: ['@codemirror/state', '@codemirror/view', '@codemirror/language', '@lezer/common', '@lezer/highlight', '@lezer/html', '@lezer/lr'],
    alias: {
      'notron-sdk': path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'packages/notron-sdk/src'),
    },
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  // Pre-bundle heavy dependencies at dev server start to avoid blank screen on first request.
  optimizeDeps: {
    include: [
      '@codemirror/view',
      '@codemirror/state',
      '@codemirror/language',
      '@codemirror/commands',
      '@codemirror/search',
      '@codemirror/autocomplete',
      '@codemirror/lang-javascript',
      '@codemirror/lang-python',
      '@codemirror/lang-html',
      '@codemirror/lang-css',
      '@codemirror/lang-json',
      '@codemirror/lang-markdown',
      '@codemirror/lang-rust',
      '@codemirror/lang-cpp',
      '@codemirror/lang-java',
      '@codemirror/lang-go',
      '@codemirror/lang-sql',
      '@codemirror/lang-xml',
      '@codemirror/lang-php',
      '@uiw/codemirror-themes-all',
      'marked',
      
      // Tauri
      '@tauri-apps/api/core',
      '@tauri-apps/api/window',
      '@tauri-apps/plugin-dialog',
      '@tauri-apps/api/event',
      '@tauri-apps/plugin-opener',
      '@tauri-apps/plugin-fs',

      // Editor Extras
      '@lezer/highlight',
      '@codemirror/lint',
      '@fazelstudio/codemirror-stickyscroll',
      '@fazelstudio/codemirror-breadcrumbs',
      '@fazelstudio/codemirror-gitgutter',
      '@replit/codemirror-minimap',
      '@replit/codemirror-indentation-markers',

      // Utilities
      'lucide-svelte',
      'fzf',
      'xterm',
      '@xterm/addon-fit',
      'tauri-pty',

      // CodeMirror extra langs
      '@codemirror/lang-less',
      '@codemirror/lang-sass',
      '@codemirror/lang-yaml',
      '@codemirror/lang-vue',
      '@codemirror/lang-liquid',
      '@codemirror/lang-jinja',
      '@codemirror/lang-wast',
      'codemirror-lang-svelte',
      '@codemirror/lang-lezer',
      'codemirror-lang-elixir',
      '@replit/codemirror-lang-nix',
      '@exercism/codemirror-lang-gleam',
      '@replit/codemirror-lang-csharp',
      '@fazelstudio/codemirror-lang-solidity',
      '@fazelstudio/codemirror-lang-astro',
      '@fazelstudio/codemirror-lang-prisma',
      '@fazelstudio/codemirror-lang-kotlin',
      '@fazelstudio/codemirror-lang-swift',
      '@fazelstudio/codemirror-lang-c',
      '@fazelstudio/codemirror-lang-lua',
      '@fazelstudio/codemirror-lang-luau',
      '@fazelstudio/codemirror-lang-scala',
      '@nextjournal/lang-clojure',
      
      // Community Pure Lezer langs
      '@citedrive/codemirror-lang-bibtex',
      'cm-lang-dot',
      'codemirror-lang-golfscript',
      '@xiechao/codemirror-lang-handlebars',
      'codemirror-lang-hcl',
      'codemirror-lang-j',
      'codemirror-lang-janet',
      '@plutojl/lang-julia',
      '@grumptech/lezer-mustache',
      'codemirror-lang-pkl',
      'codemirror-lang-r',
      'codemirror-lang-sparql',
      '@iizukak/codemirror-lang-wgsl',
      'cm6-graphql',
      '@ndim/lezer-zig',
      'codemirror-lang-glsl'
    ],
    // Exclude Mermaid from pre-bundle because it is lazy-loaded.
    exclude: ['mermaid'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split Mermaid into a separate chunk for lazy loading.
          'mermaid': ['mermaid'],
          // Split CodeMirror core into a shared chunk.
          'codemirror': [
            '@codemirror/view',
            '@codemirror/state',
            '@codemirror/language',
            '@codemirror/commands',
            '@codemirror/search',
            '@codemirror/autocomplete',
            '@uiw/codemirror-themes-all',
            '@replit/codemirror-minimap',
          ],
        },
      },
    },
  },
}));
