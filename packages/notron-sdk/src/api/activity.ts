/**
 * Activity Capability
 *
 * Generic external activity capability for extensions that publish session state.
 */

export interface ActivityPayload {
  details: string;
  workspace: string;
  timestamp?: number | null;
  large_image?: string | null;
  large_text?: string | null;
  small_image?: string | null;
  small_text?: string | null;
}

export interface ActivityDelegate {
  init(): Promise<{ connected: boolean }>;
  setActivity(activity: ActivityPayload): Promise<void>;
  clear(): Promise<void>;
}

let delegate: ActivityDelegate | null = null;

export function setActivityDelegate(value: ActivityDelegate | null): void {
  delegate = value;
}

export function getActivityDelegate(): ActivityDelegate | null {
  return delegate;
}

export async function initActivity(): Promise<{ connected: boolean }> {
  return delegate?.init() ?? { connected: false };
}

export async function setActivity(activity: ActivityPayload): Promise<void> {
  await delegate?.setActivity(activity);
}

export async function clearActivity(): Promise<void> {
  await delegate?.clear();
}

export const activity = {
  init: initActivity,
  setActivity,
  clear: clearActivity,
} as const;
