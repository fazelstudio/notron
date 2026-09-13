/**
 * Events
 *
 * Core event types for the host.
 */
export interface NotronEvent<T extends string = string> {
  type: T;
}

export interface TextDocumentEvent extends NotronEvent<'textDocument'> {
  uri: string;
}

export interface WorkspaceEvent extends NotronEvent<'workspace'> {
  uri: string;
}

export type ExtensionEvent = TextDocumentEvent | WorkspaceEvent;

export interface EventEmitter<T extends ExtensionEvent> {
  (event: T): void;
}
