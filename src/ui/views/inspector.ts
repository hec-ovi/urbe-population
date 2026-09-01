/** Side panel: who was picked, and what they are doing now. */

import { clear, el } from '../components/dom.js';
import { NpcCard } from '../widgets/npc-card.js';
import { BehaviorCard } from '../widgets/behavior-card.js';
import type { BehaviorSummary, NpcSummary } from '../adapter/types.js';

export class InspectorView {
  private readonly npcCard: NpcCard;
  private readonly behaviorCard: BehaviorCard;
  private readonly header: HTMLElement;

  constructor(root: HTMLElement) {
    clear(root);

    this.header = el('div', 'inspector-main-header');
    const title = el('span', 'inspector-title');
    title.textContent = 'ENTITY INSPECTOR // 2D FEED';
    const tag = el('span', 'badge badge-primary');
    tag.textContent = 'LIVE';
    this.header.append(title, tag);

    const content = el('div', 'inspector-content');
    root.append(this.header, content);

    this.npcCard = new NpcCard(content);
    this.behaviorCard = new BehaviorCard(content);
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
