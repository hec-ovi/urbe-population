/** Color key and land use legend for the map with dark technical styling. */

import { clear, el } from '../components/dom.js';

export interface LegendEntry {
  label: string;
  color: string;
}

export class Legend {
  private readonly container = el('div', 'legend-container');
  private readonly grid = el('div', 'legend-grid');

  constructor(private readonly root: HTMLElement) {
    clear(root);
    const header = el('div', 'legend-header');
    const title = el('span', 'legend-title');
    title.textContent = 'MAP LAND USE // PARCELS';
    header.append(title);
    this.container.append(header, this.grid);
    root.append(this.container);
  }

  show(entries: LegendEntry[]): void {
    clear(this.grid);
    for (const entry of entries) {
      const item = el('div', 'legend-item');
      const swatch = el('span', 'legend-swatch');
      swatch.style.backgroundColor = entry.color;
      const label = el('span', 'legend-label');
      label.textContent = entry.label.replace('_', ' ');
      item.append(swatch, label);
      item.title = `Parcel type: ${entry.label}`;
      this.grid.append(item);
    }
  }
}
