/**
 * Compatibility aliases
 *
 * The legacy namespace remains available while the host uses the generic
 * activity capability internally.
 */

import {
  clearActivity,
  getActivityDelegate,
  initActivity,
  setActivity,
  setActivityDelegate,
  type ActivityDelegate,
  type ActivityPayload,
} from './activity.js';

export type DiscordActivity = ActivityPayload;
export type DiscordDelegate = ActivityDelegate;

export function setDiscordDelegate(d: DiscordDelegate | null): void {
  setActivityDelegate(d);
}

export function getDiscordDelegate(): DiscordDelegate | null {
  return getActivityDelegate();
}

export async function initDiscordPresence(): Promise<{ connected: boolean }> {
  return initActivity();
}

export async function setDiscordActivity(activity: DiscordActivity): Promise<void> {
  await setActivity(activity);
}

export async function clearDiscordPresence(): Promise<void> {
  await clearActivity();
}

export const discord = {
  init: initActivity,
  setActivity,
  clear: clearActivity,
} as const;

export const discordNamespace = discord;

export type DiscordAPI = typeof discord;
