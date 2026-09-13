import layout from './testbed.json' with { type: 'json' };
import { render } from '../ui/element.js';
import type { ElementSpec } from '../ui/schema.js';

export function renderTestbed(root: HTMLElement): void {
  render(root, layout as ElementSpec[]);
}
