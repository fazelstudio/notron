/**
 * Event Bus
 *
 * Typed pub/sub for decoupled communication between parts of the app.
 */

export interface AppEvents {
  'request-open-file': { path: string; line?: number; column?: number; endColumn?: number };
  'request-open-file-split': { path: string };
  'request-workspace-switch': { path: string };
  'split:request-close-tab': { tabId: string };
  'editor:action': { action: string; line?: number; column?: number; endColumn?: number; path?: string; options?: any };
  'editor:save': void;
  'editor:save-as': void;
  'editor:open-file': { path: string; line?: number };
  'editor:show-references': { symbol: string; results: any[] };
  'editor:sync-content': { tabId: string; content: string };
  'editor:append-chunk': { tabId: string; chunk: string };
  'editor:focus-group': { groupId: string };
  'open-command-palette': void;
  'notron:create-file': void;
  'notron:create-folder': void;
  'notron:cancel-tooltips': void;
}

type EventKey = keyof AppEvents;
type Handler<T> = (payload: T) => void;

class EventBus {
  private target: EventTarget;

  constructor(target: EventTarget = window) {
    this.target = target;
  }

  on<K extends EventKey>(event: K, handler: Handler<AppEvents[K]>): () => void {
    const wrapped = (e: Event) => {
      const detail = (e as CustomEvent).detail as AppEvents[K];
      handler(detail);
    };
    // Store wrapper for off() — keep map
    (handler as any).__wrapped = wrapped;
    this.target.addEventListener(event, wrapped as EventListener);
    return () => this.off(event, handler);
  }

  off<K extends EventKey>(event: K, handler: Handler<AppEvents[K]>): void {
    const wrapped = (handler as any).__wrapped ?? handler;
    this.target.removeEventListener(event, wrapped as EventListener);
  }

  once<K extends EventKey>(event: K, handler: Handler<AppEvents[K]>): () => void {
    const wrapped = (e: Event) => {
      const detail = (e as CustomEvent).detail as AppEvents[K];
      handler(detail);
      this.target.removeEventListener(event, wrapped as EventListener);
    };
    this.target.addEventListener(event, wrapped as EventListener);
    return () => this.target.removeEventListener(event, wrapped as EventListener);
  }

  emit<K extends EventKey>(event: K, detail?: AppEvents[K]): void {
    this.target.dispatchEvent(new CustomEvent(event, { detail }));
  }

  /** Compatibility: listen to raw string event (for migration period) */
  onRaw(event: string, handler: (e: Event) => void): () => void {
    this.target.addEventListener(event, handler as EventListener);
    return () => this.target.removeEventListener(event, handler as EventListener);
  }

  emitRaw(event: string, detail?: any): void {
    this.target.dispatchEvent(new CustomEvent(event, { detail }));
  }
}

export const eventBus = new EventBus();

// Legacy alias — keeps `import { eventBus } from '$lib/utils/eventBus'` consistent
export const appEvents = eventBus;