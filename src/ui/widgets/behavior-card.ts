/** What the selected NPC is doing right now: real-time activity, mode, venue and interior state. */

import { clear, el, kvRow } from '../components/dom.js';
import type { BehaviorSummary } from '../adapter/types.js';

export class BehaviorCard {
  private readonly container = el('div', 'inspector-section behavior-section');

  constructor(private readonly root: HTMLElement) {
    this.showEmpty();
    root.append(this.container);
  }

  showEmpty(): void {
    clear(this.container);
    const box = el('div', 'empty-state-box empty-behavior');
    const title = el('div', 'empty-title');
    title.textContent = 'NO ACTIVE BEHAVIOR STREAM';
    box.append(title);
    this.container.append(box);
  }

  show(state: BehaviorSummary | null): void {
    clear(this.container);

    if (!state) {
      const offline = el('div', 'error-state-box');
      const tag = el('div', 'error-tag');
      tag.textContent = '[STATUS: OFFLINE / UNTRACKED]';
      const body = el('div', 'error-body');
      body.textContent = 'NPC is deceased, uninstantiated, or out of simulation range.';
      offline.append(tag, body);
      this.container.append(offline);
      return;
    }

    const card = el('div', 'card-block card-behavior');

    // Header with Live Pulse Indicator
    const head = el('div', 'card-block-title live-head');
    const pulseDot = el('span', 'live-pulse');
    const headText = el('span', 'live-title-text');
    headText.textContent = '// REAL-TIME STATE';
    head.append(pulseDot, headText);

    // Activity banner
    const banner = el('div', 'activity-banner');
    const actLabel = el('span', 'activity-label');
    actLabel.textContent = state.activity.toUpperCase();
    const modeBadge = el('span', 'badge badge-primary');
    modeBadge.textContent = state.mode.toUpperCase();
    banner.append(actLabel, modeBadge);

    const body = el('div', 'card-block-content');
    body.append(
      banner,
      kvRow('Location', `${state.place.kind.toUpperCase()}: ${state.place.id}`, 'mono-code'),
    );

    const inside = state.interior;
    if (inside?.kind === 'at') {
      body.append(
        kvRow('Anchor Node', inside.anchorId, 'mono-code'),
        kvRow('Animation', inside.animation, 'text-highlight'),
      );
    } else if (inside?.kind === 'walk') {
      body.append(
        kvRow('Wayfinding', `${inside.fromAnchorId} ➔ ${inside.toAnchorId}`, 'mono-code'),
      );
    }

    if (state.interrupted) {
      const alert = el('div', 'alert-interrupted');
      alert.textContent = '⚠ ROUTINE INTERRUPTED (DIRECT PLAYER ENGAGEMENT)';
      body.append(alert);
    }

    card.append(head, body);
    this.container.append(card);
    this.animate();
  }

  clear(): void {
    this.showEmpty();
  }

  private animate(): void {
    this.container.classList.remove('panel-flash');
    void this.container.offsetWidth;
    this.container.classList.add('panel-flash');
  }
}
