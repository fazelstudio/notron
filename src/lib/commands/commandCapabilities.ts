/**
 * Command Capabilities
 *
 * Single declaration of which commands are sensitive (filesystem, shell, or
 * network side effects). Kept as data so the trust model can be enabled later
 * by installing a gate — no handler audit needed.
 */

import { commandRegistry, type CommandCapability } from './registry';

// `trusted` — acts on the filesystem or a shell inside the workspace.
// `dangerous` — leaves the workspace (network / remote) or overwrites files.
const SENSITIVE: Array<[string, CommandCapability]> = [
  // Shell / terminal.
  ['workbench.action.terminal.new', 'trusted'],
  ['workbench.action.terminal.killActive', 'trusted'],
  ['workbench.action.run', 'trusted'],
  ['workbench.action.runCurrentFile', 'trusted'],
  ['workbench.action.debug.run', 'trusted'],
  ['workbench.action.stopRun', 'trusted'],
  ['explorer.openInTerminal', 'trusted'],
  ['run.createLaunchJson', 'trusted'],

  // Filesystem mutation.
  ['explorer.delete', 'dangerous'],
  ['explorer.rename', 'trusted'],
  ['explorer.paste', 'trusted'],
  ['explorer.duplicate', 'trusted'],
  ['workbench.action.files.save', 'trusted'],
  ['workbench.action.files.saveAs', 'dangerous'],

  // Source control (network + history)
  ['git.init', 'trusted'],
  ['git.commit', 'trusted'],
  ['git.push', 'dangerous'],
  ['git.pull', 'dangerous'],
  ['git.fetch', 'dangerous'],
  ['git.publish', 'dangerous'],
  ['git.discard', 'dangerous'],
];

for (const [id, capability] of SENSITIVE) {
  commandRegistry.markCapability(id, capability);
}
