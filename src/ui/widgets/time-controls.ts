/** Play/pause, week slider and clock readout. Owns the playback timer. */

import { el } from '../components/dom.js';
import { formatClock } from '../components/time-format.js';

export interface TimeControlsOptions {
  min: number;
  max: number;
  value: number;
  /** Minutes advanced per playback tick. */
  stepMin: number;
  tickMs: number;
  onChange: (timeMin: number) => void;
}

export class TimeControls {
  private readonly button = el('button', 'control-button');
  private readonly slider = el('input', 'control-slider');
  private readonly clock = el('span', 'control-clock');
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(root: HTMLElement, private readonly opts: TimeControlsOptions) {
    this.button.type = 'button';
    this.button.textContent = 'play';
    this.slider.type = 'range';
    this.slider.min = String(opts.min);
    this.slider.max = String(opts.max);
    this.slider.step = '1';
    this.slider.value = String(opts.value);

    this.button.addEventListener('click', () => this.toggle());
    this.slider.addEventListener('input', () => this.emit());
    root.append(this.button, this.slider, this.clock);
    this.updateClock();
  }

  get value(): number {
    return Number(this.slider.value);
  }

  private toggle(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.button.textContent = 'play';
      return;
    }
    this.button.textContent = 'pause';
    this.timer = setInterval(() => this.advance(), this.opts.tickMs);
  }

  private advance(): void {
    const span = this.opts.max - this.opts.min + 1;
    const next = this.opts.min + ((this.value - this.opts.min + this.opts.stepMin) % span);
    this.slider.value = String(next);
    this.emit();
  }

  private emit(): void {
    this.updateClock();
    this.opts.onChange(this.value);
  }

  private updateClock(): void {
    this.clock.textContent = formatClock(this.value);
  }
}
