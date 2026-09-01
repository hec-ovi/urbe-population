/** What the selected NPC is doing at the current minute. */

import { TextPanel } from '../components/text-panel.js';
import type { BehaviorSummary } from '../adapter/types.js';

export class BehaviorCard {
  private readonly panel: TextPanel;

  constructor(root: HTMLElement) {
    this.panel = new TextPanel(root, 'Now');
  }

  show(state: BehaviorSummary | null): void {
    if (!state) {
      this.panel.set('(dead or unknown)');
      return;
    }
    const lines = [`${state.activity} (${state.mode}) at ${state.place.kind} ${state.place.id}`];
    const inside = state.interior;
    if (inside?.kind === 'at') lines.push(`anchor ${inside.anchorId} · ${inside.animation}`);
    if (inside?.kind === 'walk') lines.push(`walking ${inside.fromAnchorId} -> ${inside.toAnchorId}`);
    if (state.interrupted) lines.push('[interrupted]');
    this.panel.setLines(lines);
  }

  clear(): void {
    this.panel.set('');
  }
}
