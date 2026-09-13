import layout from './inspector.json' with { type: 'json' };
import { inspectorData } from '../adapter/inspector-data.js';
import type { BehaviorSummary, NpcSummary } from '../adapter/types.js';
import { render } from '../ui/element.js';
import type { ElementSpec, ViewActions } from '../ui/schema.js';

export class InspectorView {
  private npc: NpcSummary | undefined;
  private state: BehaviorSummary | null | undefined;
  private error: string | undefined;

  constructor(private readonly root: HTMLElement, private readonly actions: ViewActions) { this.refresh(); }

  showNpc(npc: NpcSummary): void { this.npc = npc; this.error = undefined; this.state = undefined; this.refresh(); }
  showBehavior(state: BehaviorSummary | null): void { this.state = state; this.refresh(); }
  showError(message: string): void { this.npc = undefined; this.state = undefined; this.error = message; this.refresh(); }

  private refresh(): void {
    render(this.root, layout.layout as ElementSpec[], inspectorData(this.npc, this.state, this.error), this.actions);
  }
}
