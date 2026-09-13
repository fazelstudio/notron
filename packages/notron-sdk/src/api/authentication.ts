/**
 * Authentication
 *
 * Typed stub for authentication providers. Providers are kept in memory for inspection; session calls need a host delegate.
 */
import type { Disposable, Event } from './types.js';
import { Emitter, toDisposable } from './types.js';
import { NotImplementedError } from '../host/errors.js';

export interface AuthenticationSession {
  id: string;
  accessToken: string;
  account: { label: string; id: string };
  scopes: string[];
}

export interface AuthenticationProvider {
  id: string;
  label: string;
  onDidChangeSessions?: Event<{ added?: string[]; removed?: string[]; changed?: string[] }>;
  getSessions(scopes?: string[]): Promise<AuthenticationSession[]>;
  createSession(scopes: string[]): Promise<AuthenticationSession>;
  removeSession(sessionId: string): Promise<void>;
}

export interface AuthenticationGetSessionOptions {
  createIfNone?: boolean;
  forceNewSession?: boolean | { detail: string };
  clearSessionPreference?: boolean;
  silent?: boolean;
}

export interface AuthenticationDelegate {
  registerAuthenticationProvider?(id: string, label: string, provider: AuthenticationProvider): Disposable;
  getSession?(providerId: string, scopes: string[], options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined>;
  onDidChangeSessions?: Event<{ providerId: string }>;
}

let authDelegate: AuthenticationDelegate | null = null;

export function setAuthenticationDelegate(d: AuthenticationDelegate | null): void {
  authDelegate = d;
}

export function getAuthenticationDelegate(): AuthenticationDelegate | null {
  return authDelegate;
}

const providers = new Map<string, { label: string; provider: AuthenticationProvider }>();
const sessionChangeEmitter = new Emitter<{ providerId: string }>();

export function registerAuthenticationProvider(
  id: string,
  label: string,
  provider: AuthenticationProvider,
): Disposable {
  if (!id || !id.trim()) throw new TypeError('[authentication] id must be non-empty string');
  if (!label || !label.trim()) throw new TypeError('[authentication] label must be non-empty string');
  if (!provider || typeof provider.getSessions !== 'function' || typeof provider.createSession !== 'function') {
    throw new TypeError('[authentication] provider must implement getSessions and createSession');
  }
  if (authDelegate?.registerAuthenticationProvider) {
    return authDelegate.registerAuthenticationProvider(id, label, provider);
  }
  if (providers.has(id)) {
    console.warn(`[authentication] overwriting provider "${id}"`);
  }
  providers.set(id, { label, provider });
  // Warn once when host is not available.
  if (!warnedStub) {
    warnedStub = true;
    console.warn(
      '[authentication] Provider registered in SDK in-memory registry. ' +
        'Notron core does not yet implement authentication sessions — getSession/createSession will throw NotImplementedError ' +
        '(see NOTRON_SDK_01_API_SURFACE , very low priority, typed stub).',
    );
  }
  return toDisposable(() => {
    if (providers.get(id)?.provider === provider) providers.delete(id);
  });
}

let warnedStub = false;

export async function getSession(
  providerId: string,
  scopes: string[],
  options?: AuthenticationGetSessionOptions,
): Promise<AuthenticationSession | undefined> {
  void options;
  if (authDelegate?.getSession) {
    return authDelegate.getSession(providerId, scopes, options);
  }
  throw new NotImplementedError(
    'authentication.getSession',
    `No authentication delegate for provider "${providerId}". Notron core does not yet host OAuth sessions. ` +
      'Provider remains inspectable via __getAuthenticationProviders() but cannot issue tokens.',
  );
}

export const onDidChangeSessions: Event<{ providerId: string }> = (listener, thisArg, disposables) => {
  if (authDelegate?.onDidChangeSessions) {
    return authDelegate.onDidChangeSessions(listener as (e: { providerId: string }) => unknown, thisArg, disposables);
  }
  return sessionChangeEmitter.event(listener as (e: { providerId: string }) => unknown, thisArg, disposables);
};

export function __getAuthenticationProviders(): Map<string, { label: string; provider: AuthenticationProvider }> {
  return providers;
}

export function __fireDidChangeSessions(providerId: string): void {
  sessionChangeEmitter.fire({ providerId });
}

export function __clearAuthentication(): void {
  providers.clear();
  warnedStub = false;
}

export const authentication = {
  registerAuthenticationProvider,
  getSession,
  onDidChangeSessions,
} as const;

export const authenticationNamespace = authentication;
