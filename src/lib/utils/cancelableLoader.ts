/**
 * cancelableLoader.ts — Request cancellation / generation token (ASYNC-003)
 *
 * Prevents race conditions when a user triggers multiple async operations
 * (e.g. opening files) in quick succession. Each call to `load()` increments
 * an internal token; when the async callback resolves, the token is compared
 * to the latest one. If superseded, the result is silently discarded.
 *
 * Usage:
 *   const loader = createCancelableLoader<string>();
 *   async function openFile(path: string) {
 *     const content = await loader.load((token) => invoke('read_file_text', { path }));
 *     if (content === undefined) return; // superseded
 *     applyContent(content);
 *   }
 */

export interface CancelableLoader<T> {
  /** Run an async operation tied to this loader's generation. Returns the
   *  result if still current, or `undefined` if a newer call was made. */
  load: (fn: (token: number) => Promise<T>) => Promise<T | undefined>;
  /** The current generation token (read-only). */
  readonly token: number;
  /** Reset the token counter to 0. */
  reset: () => void;
}

export function createCancelableLoader<T>(): CancelableLoader<T> {
  let currentToken = 0;

  return {
    get token() {
      return currentToken;
    },

    async load(fn: (token: number) => Promise<T>): Promise<T | undefined> {
      const myToken = ++currentToken;
      const result = await fn(myToken);
      if (myToken !== currentToken) return undefined;
      return result;
    },

    reset() {
      currentToken = 0;
    },
  };
}
