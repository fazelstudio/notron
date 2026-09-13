/**
 * Errors
 *
 * Typed errors for host isolation.
 */
export class NotronError extends Error {
 constructor(
 message: string,
 public readonly code?: string,
 ) {
 super(message);
 this.name = this.constructor.name;
 }
}

export class NotImplementedError extends NotronError {
 constructor(feature: string, detail?: string) {
 super(
 `[notron-sdk] Not implemented: ${feature}${detail ? ` — ${detail}` : ''}. This API is a typed stub (see NOTRON_SDK_01_API_SURFACE) and will be wired when Notron core provides the underlying capability.`,
 'NOT_IMPLEMENTED',
 );
 }
}

export class ExtensionActivationError extends NotronError {
 constructor(
 public readonly extensionId: string,
 cause: unknown,
 ) {
 const msg = cause instanceof Error ? cause.message : String(cause);
 super(`Extension "${extensionId}" failed to activate: ${msg}`, 'EXT_ACTIVATION_FAILED');
 if (cause instanceof Error && cause.stack) this.stack = cause.stack;
 }
}

export class ExtensionRuntimeError extends NotronError {
 constructor(
 public readonly extensionId: string,
 public readonly hook: string,
 cause: unknown,
 ) {
 const msg = cause instanceof Error ? cause.message : String(cause);
 super(`Extension "${extensionId}" error in ${hook}: ${msg}`, 'EXT_RUNTIME_ERROR');
 if (cause instanceof Error && cause.stack) this.stack = cause.stack;
 }
}

/** Wrap a function so thrown errors are caught and routed to a logger. */
export function withErrorIsolation<T extends (...args: unknown[]) => unknown>(
 extensionId: string,
 hook: string,
 fn: T,
 log?: (err: ExtensionRuntimeError) => void,
): T {
 const wrapped = (...args: unknown[]): unknown => {
 try {
 const result = fn(...args);
 // handle async rejection as well
 if (result instanceof Promise) {
 return result.catch((err: unknown) => {
 const wrappedErr = new ExtensionRuntimeError(extensionId, hook, err);
 if (log) log(wrappedErr);
 else console.error(wrappedErr.message, err);
 // swallow — do not propagate to host
 return undefined;
 });
 }
 return result;
 } catch (err) {
 const wrappedErr = new ExtensionRuntimeError(extensionId, hook, err);
 if (log) log(wrappedErr);
 else console.error(wrappedErr.message, err);
 return undefined;
 }
 };
 return wrapped as T;
}

/** Safe emit: one bad listener does not prevent others. */
export function safeInvoke(
 extensionId: string,
 hook: string,
 fn: () => void,
 log?: (err: ExtensionRuntimeError) => void,
): void {
 try {
 fn();
 } catch (err) {
 const wrappedErr = new ExtensionRuntimeError(extensionId, hook, err);
 if (log) log(wrappedErr);
 else console.error(wrappedErr.message, err);
 }
}
