import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from '@tailwindcss/vite'

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [tailwindcss(), svelte()],

  resolve: {
    preserveSymlinks: true,
    // Force a single copy of CodeMirror core even for linked/local packages
    dedupe: ['@codemirror/state', '@codemirror/view', '@codemirror/language', '@lezer/common', '@lezer/highlight', '@lezer/html'],
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
  // Pre-bundle dependency berat saat dev server start, bukan saat browser request pertama
  // Ini menghilangkan blank white screen dan "Not Responding" di dev mode
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
      'codemirror-lang-glsl',

      // CodeMirror legacy modes
      '@codemirror/legacy-modes/mode/shell',
      '@codemirror/legacy-modes/mode/ruby',
      '@codemirror/legacy-modes/mode/lua',
      '@codemirror/legacy-modes/mode/perl',
      '@codemirror/legacy-modes/mode/powershell',
      '@codemirror/legacy-modes/mode/dockerfile',
      '@codemirror/legacy-modes/mode/toml',
      '@codemirror/legacy-modes/mode/properties',
      '@codemirror/legacy-modes/mode/diff',
      '@codemirror/legacy-modes/mode/cmake',
      '@codemirror/legacy-modes/mode/clike',
      '@codemirror/legacy-modes/mode/swift',
      '@codemirror/legacy-modes/mode/r',
      '@codemirror/legacy-modes/mode/pascal',
      '@codemirror/legacy-modes/mode/haskell',
      '@codemirror/legacy-modes/mode/erlang',
      '@codemirror/legacy-modes/mode/groovy',
      '@codemirror/legacy-modes/mode/mllike',
      '@codemirror/legacy-modes/mode/nginx',
      '@codemirror/legacy-modes/mode/protobuf',
      '@codemirror/legacy-modes/mode/pug',
      '@codemirror/legacy-modes/mode/stylus',
      '@codemirror/legacy-modes/mode/stex'
    ],
    // Exclude mermaid dari pre-bundle karena sudah lazy loaded
    exclude: ['mermaid'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Pisahkan mermaid ke chunk terpisah (lazy loaded)
          'mermaid': ['mermaid'],
          // Pisahkan CodeMirror core ke chunk terpisah
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
