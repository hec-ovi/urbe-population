/** Titled block of preformatted or structured text with technical frame styling. */

import { el } from './dom.js';

export class TextPanel {
  private readonly container: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly body = el('pre', 'panel-body');

  constructor(parent: HTMLElement, title: string, placeholder = '') {
    this.container = el('div', 'panel-card');
    this.heading = el('h3', 'panel-title');
    this.heading.textContent = title;
    this.body.textContent = placeholder;
    this.container.append(this.heading, this.body);
    parent.append(this.container);
  }

  set(text: string): void {
    this.body.classList.remove('is-error');
    this.body.textContent = text;
    this.animate();
  }

  setLines(lines: string[]): void {
    this.set(lines.join('\n'));
  }

  setError(text: string): void {
    this.body.textContent = text;
    this.body.classList.add('is-error');
    this.animate();
  }

  private animate(): void {
    this.body.classList.remove('panel-flash');
    // Trigger reflow to restart animation
    void this.body.offsetWidth;
    this.body.classList.add('panel-flash');
  }
}
