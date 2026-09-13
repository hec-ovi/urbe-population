import layout from './legend.json' with { type: 'json' };
import { render } from '../ui/element.js';
import type { ElementSpec } from '../ui/schema.js';

export class Legend {
  constructor(private readonly root: HTMLElement) {}
  show(entries: { label: string; color: string }[]): void {
    render(this.root, layout as ElementSpec[], { entries });
  }
}
