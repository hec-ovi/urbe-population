import { formatHourMin } from './time-format.js';

export interface PlaybackOptions {
  min: number;
  max: number;
  value: number;
  stepMin: number;
  tickMs: number;
  onChange: (timeMin: number) => void;
}

/** Preview clock; the simulation only receives its explicit minute values. */
export class Playback {
  value: number;
  stepMin: number;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: PlaybackOptions, private readonly onState: () => void) {
    this.value = Math.max(options.min, Math.min(options.max, options.value));
    this.stepMin = options.stepMin;
  }

  get playing(): boolean { return this.timer !== undefined; }

  step(minutes: number): void {
    const span = this.options.max - this.options.min + 1;
    this.seek(this.options.min + ((this.value - this.options.min + minutes) % span + span) % span);
  }

  seek(value: number): void {
    this.value = Math.max(this.options.min, Math.min(this.options.max, value));
    this.onState();
    this.options.onChange(this.value);
  }

  jumpDay(day: number, minute: number): void { this.seek(day * 1440 + minute); }

  presentation(labels: { play: string; pause: string; days: string[] }): {
    day: number; value: number; stepMin: number; playing: boolean; text: Record<string, string>;
  } {
    const day = Math.floor(this.value / 1440);
    return { day, value: this.value, stepMin: this.stepMin, playing: this.playing, text: {
      play: this.playing ? labels.pause : labels.play,
      day: labels.days[day % 7]!.toUpperCase(),
      time: `${formatHourMin(this.value % 1440)}:00`, minute: `T+${String(this.value).padStart(5, '0')}m`,
    } };
  }

  speed(minutes: number): void { this.stepMin = minutes; this.onState(); }

  toggle(): void {
    if (this.timer !== undefined) { clearInterval(this.timer); this.timer = undefined; }
    else this.timer = setInterval(() => this.step(this.stepMin), this.options.tickMs);
    this.onState();
  }
}
