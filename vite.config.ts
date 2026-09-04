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
    dedupe: ['@codemirror/state', '@codemirror/view', '@codemirror/language', '@lezer/common', '@lezer/highlight', '@lezer/html', '@lezer/lr'],
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
  // Pre-bundle heavy dependencies when the dev server starts, rather than upon the first browser request
  // This eliminates the blank white screen and "Not Responding" issues in dev mode
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
    // Exclude mermaid from the pre-bundle because it is lazy-loaded.
    exclude: ['mermaid'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split Mermaid into a separate chunk (lazy-loaded).
          'mermaid': ['mermaid'],
          // Split CodeMirror core into a separate chunk.
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
