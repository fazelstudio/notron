/**
 * Walkthrough Registry
 *
 * Registry for onboarding walkthrough sections and steps shown on the Welcome page.
 */

export interface WalkthroughStep {
  /** Stable step id */
  id: string;
  /** Label shown to the user */
  label: string;
  /** Inline SVG path data for the step icon */
  iconPath: string;
  /** Command executed when the step is selected */
  command?: string;
  /** Fallback action when no command is registered */
  action?: () => void;
  /** When false the step is hidden */
  when?: () => boolean;
}

export interface WalkthroughSection {
  /** Stable section id */
  id: string;
  title: string;
  order: number;
  steps: WalkthroughStep[];
  when?: () => boolean;
}

class WalkthroughRegistry {
  private sections = new Map<string, WalkthroughSection>();
  private listeners = new Set<() => void>();

  register(section: WalkthroughSection): { dispose: () => void } {
    if (this.sections.has(section.id)) {
      console.warn(`[walkthroughRegistry] overwriting section: ${section.id}`);
    }
    this.sections.set(section.id, section);
    this.notify();
    return {
      dispose: () => {
        if (this.sections.get(section.id) === section) {
          this.sections.delete(section.id);
          this.notify();
        }
      }
    };
  }

  registerAll(sections: WalkthroughSection[]): { dispose: () => void } {
    const disposables = sections.map((s) => this.register(s));
    return { dispose: () => disposables.forEach((d) => d.dispose()) };
  }

  getAll(): WalkthroughSection[] {
    return [...this.sections.values()].sort((a, b) => a.order - b.order);
  }

  /** Sections with their hidden steps filtered out. */
  getVisible(): WalkthroughSection[] {
    return this.getAll()
      .filter((s) => !s.when || s.when())
      .map((s) => ({ ...s, steps: s.steps.filter((step) => !step.when || step.when()) }))
      .filter((s) => s.steps.length > 0);
  }

  onDidChange(listener: () => void): { dispose: () => void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}

export const walkthroughRegistry = new WalkthroughRegistry();

// Default onboarding: the "Start" section shown on the Welcome page.
walkthroughRegistry.register({
  id: 'start',
  title: 'Start',
  order: 1,
  steps: [
    {
      id: 'newFile',
      label: 'New File',
      iconPath: 'M12 5v14M5 12h14',
      command: 'workbench.action.files.newUntitledFile'
    },
    {
      id: 'openFile',
      label: 'Open File...',
      iconPath: 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2zM14 2v6h6',
      command: 'workbench.action.files.openFile'
    },
    {
      id: 'openFolder',
      label: 'Open Folder...',
      iconPath: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z',
      command: 'workbench.action.files.openFolder'
    }
  ]
});
