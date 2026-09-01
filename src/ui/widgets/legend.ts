/** Color key for the map. */

import { clear, el } from '../components/dom.js';

export interface LegendEntry {
  label: string;
  color: string;
}

export class Legend {
  constructor(private readonly root: HTMLElement) {}

  show(entries: LegendEntry[]): void {
    clear(this.root);
    for (const entry of entries) {
      const item = el('span', 'legend-item');
      const swatch = el('i', 'legend-swatch');
      swatch.style.background = entry.color;
      item.append(swatch, document.createTextNode(entry.label));
      this.root.append(item);
    }
  }
}
