/**
 * Source Control
 *
 * Source control with in-memory fallback.
 */
import type { Event } from './types.js';
import { Emitter } from './types.js';

export interface SourceControlInputBox {
  value: string;
  placeholder: string;
}

export interface SourceControlResourceState {
  resourceUri: string;
  command?: { title: string; command: string; arguments?: unknown[] };
  decorations?: {
    strikeThrough?: boolean;
    faded?: boolean;
    tooltip?: string;
    light?: { iconPath?: string };
    dark?: { iconPath?: string };
  };
  contextValue?: string;
}

export interface SourceControlResourceGroup {
  id: string;
  label: string;
  hideWhenEmpty?: boolean;
  resourceStates: SourceControlResourceState[];
  dispose(): void;
}

export interface SourceControl {
  id: string;
  label: string;
  rootUri?: string;
  inputBox: SourceControlInputBox;
  count?: number;
  quickDiffProvider?: unknown;
  commitTemplate?: string;
  acceptInputCommand?: { command: string; title: string; arguments?: unknown[] };
  statusBarCommands?: Array<{ command: string; title: string }>;

  createResourceGroup(id: string, label: string): SourceControlResourceGroup;
  dispose(): void;
}

export interface ScmDelegate {
  createSourceControl?(id: string, label: string, rootUri?: string): SourceControl;
  getSourceControls?(): SourceControl[];
}

let scmDelegate: ScmDelegate | null = null;

export function setScmDelegate(d: ScmDelegate | null): void {
  scmDelegate = d;
}

export function getScmDelegate(): ScmDelegate | null {
  return scmDelegate;
}

const sourceControls = new Map<string, SourceControlImpl>();
const scmEmitter = new Emitter<SourceControl | undefined>();
let selectedControl: SourceControl | undefined;

class ResourceGroupImpl implements SourceControlResourceGroup {
  private _states: SourceControlResourceState[] = [];
  private disposed = false;
  hideWhenEmpty?: boolean;

  private emitter = new Emitter<void>();

  constructor(
    public readonly id: string,
    public readonly label: string,
    private parent: SourceControlImpl,
  ) {}

  get resourceStates(): SourceControlResourceState[] {
    return [...this._states];
  }

  set resourceStates(value: SourceControlResourceState[]) {
    if (this.disposed) return;
    this._states = [...value];
    this.emitter.fire();
    this.parent.fireChange();
  }

  get onDidChange(): Event<void> {
    return this.emitter.event;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.parent.removeGroup(this.id);
  }
}

class SourceControlImpl implements SourceControl {
  inputBox: SourceControlInputBox = { value: '', placeholder: '' };
  count?: number;
  quickDiffProvider?: unknown;
  commitTemplate?: string;
  acceptInputCommand?: { command: string; title: string; arguments?: unknown[] };
  statusBarCommands?: Array<{ command: string; title: string }>;

  private groups = new Map<string, ResourceGroupImpl>();
  private disposed = false;
  private emitter = new Emitter<void>();

  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly rootUri?: string,
  ) {}

  createResourceGroup(id: string, label: string): SourceControlResourceGroup {
    if (this.disposed) throw new Error('[scm] SourceControl already disposed');
    if (!id || !label) throw new TypeError('[scm] createResourceGroup: id and label required');
    if (this.groups.has(id)) throw new Error(`[scm] ResourceGroup "${id}" already exists on "${this.id}"`);
    const g = new ResourceGroupImpl(id, label, this);
    this.groups.set(id, g);
    this.fireChange();
    return g;
  }

  removeGroup(id: string): void {
    this.groups.delete(id);
    this.fireChange();
  }

  getGroups(): SourceControlResourceGroup[] {
    return [...this.groups.values()];
  }

  get onDidChange(): Event<void> {
    return this.emitter.event;
  }

  fireChange(): void {
    if (this.count === undefined) {
      let n = 0;
      for (const g of this.groups.values()) n += g.resourceStates.length;
      void n;
    }
    this.emitter.fire();
    scmEmitter.fire(this);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const g of [...this.groups.values()]) g.dispose();
    this.groups.clear();
    sourceControls.delete(this.id);
    if (selectedControl === (this as unknown as SourceControl)) {
      selectedControl = undefined;
      scmEmitter.fire(undefined);
    }
  }
}

export function createSourceControl(id: string, label: string, rootUri?: string): SourceControl {
  if (!id || !id.trim()) throw new TypeError('[scm] id must be non-empty string');
  if (!label || !label.trim()) throw new TypeError('[scm] label must be non-empty string');
  if (sourceControls.has(id) && !scmDelegate?.createSourceControl) {
    throw new Error(`[scm] SourceControl "${id}" already exists`);
  }
  if (scmDelegate?.createSourceControl) {
    return scmDelegate.createSourceControl(id, label, rootUri);
  }
  const sc = new SourceControlImpl(id, label, rootUri);
  sourceControls.set(id, sc);
  if (!selectedControl) {
    selectedControl = sc as unknown as SourceControl;
  }
  scmEmitter.fire(sc as unknown as SourceControl);
  return sc as unknown as SourceControl;
}

export function getSourceControls(): SourceControl[] {
  if (scmDelegate?.getSourceControls) return scmDelegate.getSourceControls();
  return [...sourceControls.values()] as unknown as SourceControl[];
}

export const onDidChangeSelectedSourceControl: Event<SourceControl | undefined> = scmEmitter.event;

export function __getSourceControls(): Map<string, SourceControlImpl> {
  return sourceControls;
}

export function __clearScm(): void {
  for (const sc of [...sourceControls.values()]) sc.dispose();
  sourceControls.clear();
  selectedControl = undefined;
}

export const scm = {
  createSourceControl,
  getSourceControls,
  onDidChangeSelectedSourceControl,
} as const;

export const scmNamespace = scm;
