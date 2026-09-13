import config from './time-controls.json' with { type: 'json' };
import { Playback, type PlaybackOptions } from '../adapter/playback.js';
import { render } from '../ui/element.js';
import type { ElementSpec } from '../ui/schema.js';

export class TimeControls {
  private readonly playback: Playback;

  constructor(private readonly root: HTMLElement, options: PlaybackOptions) {
    this.playback = new Playback(options, () => this.update());
    render(root, config.layout as ElementSpec[], {
      ...options, steps: config.steps, speeds: config.speeds,
      days: config.days.map((label, index) => ({ label, index })),
    }, {
      toggle: () => this.toggle(),
      step: (_, data) => this.playback.step(Number(data.minutes)),
      speed: (_, data) => this.playback.speed(Number(data.minutes)),
      day: (_, data) => this.playback.jumpDay(Number(data.index), config.jumpMinute),
      seek: (event) => this.playback.seek(Number((event.target as HTMLInputElement).value)),
    });
    this.update();
  }

  get value(): number { return this.playback.value; }
  toggle(): void { this.playback.toggle(); }

  private update(): void {
    const state = this.playback.presentation(config);
    this.root.querySelectorAll<HTMLElement>('[data-bind]').forEach((node) => { node.textContent = state.text[node.dataset.bind!]!; });
    this.root.querySelector<HTMLInputElement>('input')!.value = String(state.value);
    this.root.querySelector('.play-btn')!.classList.toggle('is-playing', state.playing);
    this.root.querySelectorAll<HTMLElement>('[data-speed]').forEach((node) => node.classList.toggle('is-active', Number(node.dataset.speed) === state.stepMin));
    this.root.querySelectorAll<HTMLElement>('[data-day]').forEach((node) => node.classList.toggle('is-active', Number(node.dataset.day) === state.day));
  }
}
