/**
 * Discord Presence Extension
 *
 * Built-in extension that shows coding activity on Discord via Rich Presence.
 * Fully independent — interacts with the editor only through `notron-sdk`.
 */

import { activity, commands, workspace, window, type ExtensionContext } from 'notron-sdk';

// Local defaults previously from `src/lib/constants`; kept inside the extension
// so no core import is required.
const DISCORD_UPDATE_DEBOUNCE_MS = 1500;
const DISCORD_LARGE_IMAGE = 'notron';
const DISCORD_LARGE_TEXT = 'Notron Editor';

// Internal state
let startTimestamp: number | null = null;
let updateTimer: ReturnType<typeof setTimeout> | null = null;
let isConnected = false;
let isSettingUp = false;

function isPresenceEnabled(): boolean {
  try {
    const cfg = workspace.getConfiguration();
    const val = cfg.get<boolean>('discord_presence');
    if (typeof val === 'boolean') return val;
  } catch {}
  return true;
}

function getWorkspaceLabel(): string {
  try {
    const folders = workspace.workspaceFolders;
    if (!folders || folders.length === 0) return 'No Folder Open';
    const name = folders[0]?.name;
    if (name) return name;
    const uri = folders[0]?.uri ?? '';
    const parts = uri.split(/[/\\]/);
    const last = parts.filter(Boolean).pop();
    return last || 'No Folder Open';
  } catch {
    return 'No Folder Open';
  }
}

function getFileDetails(): { details: string; state: string; smallImage?: string; smallText?: string } {
  const workspaceLabel = getWorkspaceLabel();
  try {
    const editor = window.activeTextEditor;
    const doc = editor?.document;
    if (!doc || doc.languageId === 'welcome' || doc.languageId === 'settings') {
      return { details: 'Idle', state: `In ${workspaceLabel}` };
    }
    const uri: string = doc.uri ?? '';
    if (!uri || uri.startsWith('Untitled') || uri.startsWith('untitled:')) {
      return { details: 'Editing Untitled', state: `In ${workspaceLabel}` };
    }
    const fileName: string = doc.fileName || uri.split(/[/\\]/).pop() || 'Unknown';
    const lang: string = (doc.languageId || 'plaintext').trim();
    const details = `Editing ${fileName}`;
    const state = workspaceLabel === 'No Folder Open' ? 'In Notron Editor' : `In ${workspaceLabel}`;
    const smallImage = lang && lang !== 'plaintext' ? lang.toLowerCase().replace(/[^a-z0-9_:-]/g, '') : undefined;
    const smallText = lang && lang !== 'plaintext' ? lang : undefined;
    return { details, state, smallImage, smallText };
  } catch {
    return { details: 'Idle', state: `In ${workspaceLabel}` };
  }
}

async function initPresence(): Promise<void> {
  if (!isPresenceEnabled()) return;
  if (isConnected) return;
  if (isSettingUp) return;
  isSettingUp = true;
  try {
    const res = await activity.init();
    isConnected = !!res?.connected;
    if (isConnected && startTimestamp === null) {
      startTimestamp = Math.floor(Date.now() / 1000);
    }
  } catch {
    isConnected = false;
  } finally {
    isSettingUp = false;
  }
}

async function clearPresence(): Promise<void> {
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  try {
    await activity.clear();
  } catch {}
  isConnected = false;
  startTimestamp = null;
}

async function doUpdate(): Promise<void> {
  if (!isPresenceEnabled()) {
    if (isConnected) await clearPresence();
    return;
  }
  if (!isConnected) {
    await initPresence();
    if (!isConnected) return;
  }
  const info = getFileDetails();
  if (startTimestamp === null) startTimestamp = Math.floor(Date.now() / 1000);
  try {
    await activity.setActivity({
      details: info.details,
      workspace: info.state,
      timestamp: startTimestamp,
      large_image: DISCORD_LARGE_IMAGE,
      large_text: DISCORD_LARGE_TEXT,
      small_image: info.smallImage ?? null,
      small_text: info.smallText ?? null,
    });
  } catch {
    // Ignore — Discord may not be running.
  }
}

function scheduleUpdate(): void {
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(() => {
    void doUpdate();
  }, DISCORD_UPDATE_DEBOUNCE_MS);
}

export async function activate(context: ExtensionContext): Promise<void> {
  // Commands via SDK — mirrored into core's palette by sdkBridge.
  context.subscriptions.push(
    commands.registerCommand('discord.enablePresence', async () => {
      await workspace.getConfiguration().update('discord_presence', true);
      await initPresence();
      scheduleUpdate();
      void window.showInformationMessage('Discord Presence enabled');
    }),
  );
  context.subscriptions.push(
    commands.registerCommand('discord.disablePresence', async () => {
      await workspace.getConfiguration().update('discord_presence', false);
      await clearPresence();
      void window.showInformationMessage('Discord Presence disabled');
    }),
  );
  context.subscriptions.push(
    commands.registerCommand('discord.togglePresence', async () => {
      const enabled = isPresenceEnabled();
      if (enabled) {
        await workspace.getConfiguration().update('discord_presence', false);
        await clearPresence();
        void window.showInformationMessage('Discord Presence disabled');
      } else {
        await workspace.getConfiguration().update('discord_presence', true);
        await initPresence();
        scheduleUpdate();
        void window.showInformationMessage('Discord Presence enabled');
      }
    }),
  );

  // React to configuration changes via SDK.
  context.subscriptions.push(
    workspace.onDidChangeConfiguration((e: any) => {
      if (e.affectsConfiguration('discord_presence')) {
        const enabled = isPresenceEnabled();
        if (enabled) {
          void initPresence().then(() => scheduleUpdate());
        } else {
          void clearPresence();
        }
      }
    }),
  );

  // Editor and workspace changes — debounced.
  context.subscriptions.push(window.onDidChangeActiveTextEditor(() => scheduleUpdate()));
  context.subscriptions.push(
    workspace.onDidChangeWorkspaceFolders(() => scheduleUpdate()),
  );

  if (isPresenceEnabled()) {
    await initPresence();
    scheduleUpdate();
  }
}

export async function deactivate(): Promise<void> {
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  try {
    await clearPresence();
  } catch {}
}
