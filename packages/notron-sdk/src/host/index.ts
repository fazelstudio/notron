/**
 * Host
 *
 * Public entry for host runtime.
 */
export { ExtensionContext } from './context.js';
export type { ExtensionContextOptions } from './context.js';

export {
 InMemoryMemento,
 InMemorySecretStorage,
 createFileMementoPersistence,
} from './memento.js';
export type { Memento, SecretStorage, MementoPersistence } from './memento.js';

export { NotronEventBus, createEventBus, SDK_EVENTS, bridgeExternalEvent, toEvent } from './eventBus.js';

export {
 NotronError,
 NotImplementedError,
 ExtensionActivationError,
 ExtensionRuntimeError,
 withErrorIsolation,
 safeInvoke,
} from './errors.js';

export {
 ExtensionHost,
 topologicalSort,
 isCompatible,
} from './lifecycle.js';
export type { ExtensionModule, ResolvedExtension, HostOptions, SortResult } from './lifecycle.js';

export { registerManifestContributions } from './contributions.js';

import { ExtensionHost } from './lifecycle.js';
import { NotronEventBus } from './eventBus.js';

export function createHost(options?: ConstructorParameters<typeof ExtensionHost>[0]): ExtensionHost {
 return new ExtensionHost(options);
}

export function createDefaultEventBus(): NotronEventBus {
 return new NotronEventBus();
}
