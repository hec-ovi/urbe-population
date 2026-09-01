/** Side panel: who was picked, and what they are doing now. */

import { NpcCard } from '../widgets/npc-card.js';
import { BehaviorCard } from '../widgets/behavior-card.js';
import type { BehaviorSummary, NpcSummary } from '../adapter/types.js';

export class InspectorView {
  private readonly npcCard: NpcCard;
  private readonly behaviorCard: BehaviorCard;

  constructor(root: HTMLElement) {
    this.npcCard = new NpcCard(root);
    this.behaviorCard = new BehaviorCard(root);
  }

  showNpc(npc: NpcSummary): void {
    this.npcCard.show(npc);
  }

  showBehavior(state: BehaviorSummary | null): void {
    this.behaviorCard.show(state);
  }

  showError(message: string): void {
    this.npcCard.showError(message);
    this.behaviorCard.clear();
  }
}
