/** Titled block of preformatted text. */

import { el } from './dom.js';

export class TextPanel {
  private readonly body = el('pre', 'panel-body');

  constructor(parent: HTMLElement, title: string, placeholder = '') {
    const heading = el('h3', 'panel-title');
    heading.textContent = title;
    this.body.textContent = placeholder;
    parent.append(heading, this.body);
  }

  set(text: string): void {
    this.body.classList.remove('is-error');
    this.body.textContent = text;
  }

  setLines(lines: string[]): void {
    this.set(lines.join('\n'));
  }

  setError(text: string): void {
    this.body.textContent = text;
    this.body.classList.add('is-error');
  }
}
