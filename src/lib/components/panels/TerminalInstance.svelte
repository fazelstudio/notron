<!--
 * Terminal Instance
 *
 * Individual integrated terminal backed by tauri-pty.
-->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from 'xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { spawn } from "tauri-pty";
  import 'xterm/css/xterm.css';

  interface Props {
    tabId: string;
    type: TerminalType;
    cwd: string;
    initialCommand?: string;
    env?: Record<string, string>;
  }

  let { tabId, type, cwd, initialCommand, env }: Props = $props();

  let terminalContainer = $state<HTMLElement | null>(null);
  let term: Terminal;
  let fitAddon: FitAddon;
  let resizeObserver: ResizeObserver;
  let ptyProcess: any = null;

  import { terminalStore } from '../../stores/terminal';
  import { SHELL_BINARIES, type TerminalType } from '../../constants';
  let isResizing = $derived($terminalStore.isResizing);

  $effect(() => {
    // When the user completely stops dragging, we send the final resize to the PTY.
    if (!isResizing && ptyProcess && term && term.cols && term.rows) {
      ptyProcess.resize(term.cols, term.rows);
    }
  });

  async function startShell() {
    try {
      ptyProcess = spawn(SHELL_BINARIES[type], [], {
        cols: term.cols || 80,
        rows: term.rows || 24,
        cwd: cwd || undefined,
        // Merged over the inherited environment by the PTY plugin, so PATH
        // and friends survive when Run injects config env vars.
        env: env && Object.keys(env).length > 0 ? env : undefined
      });

      // Catch inner initialization errors (e.g. capabilities)
      if (ptyProcess._init) {
        ptyProcess._init.catch((err: any) => {
          term.writeln(`\r\n[PTY Init Error: ${err}]`);
        });
      }

      ptyProcess.onData((data: Uint8Array) => {
        term.write(new TextDecoder().decode(data));
      });

      ptyProcess.onExit(() => {
        terminalStore.unregisterProcess(tabId);
        terminalStore.closeTerminal(tabId);
      });

      // Expose the kill handle so the store (and the Run feature) can stop
      // this process without going through the terminal UI.
      terminalStore.registerProcess(tabId, () => { try { ptyProcess?.kill(); } catch {} });

      term.onData(data => {
        if (!ptyProcess) return;
        ptyProcess.write(data);
      });

      if (initialCommand?.trim()) {
        ptyProcess.write(initialCommand.endsWith('\n') ? initialCommand : `${initialCommand}\r\n`);
        terminalStore.consumeInitialCommand(tabId);
      }
    } catch (e) {
      term.writeln(`\r\n[Failed to spawn PTY shell: ${e}]`);
    }
  }

  $effect(() => {
    // This effect runs whenever the theme changes; always reads the current
    // values from the global theme CSS variables so xterm stays in sync.
    if (term && typeof window !== 'undefined') {
      // Use setTimeout to ensure DOM has updated the .dark class on document element
      setTimeout(() => {
        const cs = getComputedStyle(document.body);
        const read = (name: string) => cs.getPropertyValue(name).trim();

        const foreground = read('--text-primary');
        const selection = read('--bg-selected');
        const red = read('--color-status-error');
        const green = read('--color-status-success');
        const yellow = read('--color-status-warning');
        const blue = read('--color-status-info');

        term.options.theme = {
          background: 'transparent',
          foreground,
          cursor: foreground,
          selectionBackground: selection,
          red, brightRed: red,
          green, brightGreen: green,
          yellow, brightYellow: yellow,
          blue, brightBlue: blue,
        };
      }, 10);
    }
  });

  onMount(() => {
    if (!terminalContainer) return;

    term = new Terminal({
      theme: { background: 'transparent' },
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalContainer);
    fitAddon.fit();

    // Copy on Ctrl+C if text is selected
    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.code === 'KeyC' && e.type === 'keydown') {
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection());
          term.clearSelection();
          return false; // Prevent sending SIGINT
        }
      }
      return true;
    });

    startShell();

    let resizeTimeout: ReturnType<typeof setTimeout>;
    resizeObserver = new ResizeObserver(() => {
      try { 
        fitAddon.fit(); 
        if (ptyProcess && term.cols && term.rows && !isResizing) {
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(() => {
            if (ptyProcess && term.cols && term.rows && !isResizing) {
              ptyProcess.resize(term.cols, term.rows);
            }
          }, 150);
        }
      } catch (e) {}
    });
    resizeObserver.observe(terminalContainer);
  });

  onDestroy(() => {
    if (resizeObserver) resizeObserver.disconnect();
    terminalStore.unregisterProcess(tabId);
    try {
      if (ptyProcess) ptyProcess.kill();
    } catch (e) {}
    if (term) term.dispose();
  });
</script>

<div class="w-full h-full p-2 flex flex-col overflow-hidden">
  <div class="flex-1 w-full relative overflow-hidden" bind:this={terminalContainer}></div>
  <!-- physical gap to ensure the last line is never perceived as covered by status bar -->
  <div class="h-4 w-full shrink-0"></div>
</div>

<style>
  /* Optional CSS to make sure xterm inherits Notron's theme nicely */
  :global(.xterm-viewport) {
    background-color: transparent !important;
    overflow-y: auto !important;
  }
</style>
