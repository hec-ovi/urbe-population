/** Play/pause, week slider, jump controls, speed presets, and digital clock readout. */

import { clear, el } from '../components/dom.js';
import { DAY_NAMES, formatClock, formatHourMin, timePeriod } from '../components/time-format.js';

export interface TimeControlsOptions {
  min: number;
  max: number;
  value: number;
  /** Minutes advanced per playback tick. */
  stepMin: number;
  tickMs: number;
  onChange: (timeMin: number) => void;
}

const SPEED_PRESETS = [
  { label: '1x', stepMin: 2 },
  { label: '5x', stepMin: 10 },
  { label: '15x', stepMin: 30 },
  { label: '60x', stepMin: 120 },
];

export class TimeControls {
  private readonly container = el('div', 'time-controls-box');
  private readonly playBtn = el('button', 'control-btn control-btn-primary play-btn');
  private readonly slider = el('input', 'control-slider');
  private readonly clockBox = el('div', 'clock-hud');
  private readonly dayPill = el('span', 'clock-day-pill');
  private readonly timeDigits = el('span', 'clock-time-digits');
  private readonly periodTag = el('span', 'clock-period-tag');
  private readonly minIndex = el('span', 'clock-min-index');
  private readonly speedGroup = el('div', 'btn-group speed-group');
  private readonly stepGroup = el('div', 'btn-group step-group');
  private readonly dayJumpGroup = el('div', 'btn-group day-group');

  private currentStepMin: number;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(root: HTMLElement, private readonly opts: TimeControlsOptions) {
    this.currentStepMin = opts.stepMin;
    clear(root);

    // 1. Play Button
    this.playBtn.type = 'button';
    this.playBtn.innerHTML = '<span class="btn-icon">▶</span> <span class="btn-label">PLAY</span>';
    this.playBtn.addEventListener('click', () => this.toggle());

    // 2. Step Buttons
    const stepBack1h = this.makeButton('-1h', () => this.stepBy(-60), 'Step back 1 hour');
    const stepBack15m = this.makeButton('-15m', () => this.stepBy(-15), 'Step back 15 minutes');
    const stepFwd15m = this.makeButton('+15m', () => this.stepBy(15), 'Step forward 15 minutes');
    const stepFwd1h = this.makeButton('+1h', () => this.stepBy(60), 'Step forward 1 hour');
    this.stepGroup.append(stepBack1h, stepBack15m, stepFwd15m, stepFwd1h);

    // 3. Speed Presets
    for (const preset of SPEED_PRESETS) {
      const btn = el('button', `control-btn speed-btn ${preset.stepMin === this.currentStepMin ? 'is-active' : ''}`);
      btn.type = 'button';
      btn.textContent = preset.label;
      btn.title = `Playback speed ${preset.label}`;
      btn.addEventListener('click', () => {
        this.currentStepMin = preset.stepMin;
        for (const child of Array.from(this.speedGroup.children)) {
          child.classList.remove('is-active');
        }
        btn.classList.add('is-active');
      });
      this.speedGroup.append(btn);
    }

    // 4. Day Quick Jumps
    DAY_NAMES.forEach((day, idx) => {
      const btn = el('button', 'control-btn day-btn');
      btn.type = 'button';
      btn.textContent = day;
      btn.title = `Jump to ${day} 09:00`;
      btn.addEventListener('click', () => this.jumpTo(idx * 1440 + 9 * 60));
      this.dayJumpGroup.append(btn);
    });

    // 5. Slider
    this.slider.type = 'range';
    this.slider.min = String(opts.min);
    this.slider.max = String(opts.max);
    this.slider.step = '1';
    this.slider.value = String(opts.value);
    this.slider.setAttribute('aria-label', 'Simulation week timeline');
    this.slider.addEventListener('input', () => this.emit());

    // 6. Clock HUD
    this.clockBox.append(this.dayPill, this.timeDigits, this.periodTag, this.minIndex);

    // Layout Rows
    const topRow = el('div', 'controls-row controls-top-row');
    const actionBlock = el('div', 'controls-actions');
    actionBlock.append(this.playBtn, this.stepGroup, this.speedGroup);
    topRow.append(actionBlock, this.clockBox);

    const sliderRow = el('div', 'controls-row controls-slider-row');
    sliderRow.append(this.slider);

    const daysRow = el('div', 'controls-row controls-days-row');
    const daysLabel = el('span', 'row-sublabel');
    daysLabel.textContent = 'JUMP TO DAY:';
    daysRow.append(daysLabel, this.dayJumpGroup);

    this.container.append(topRow, sliderRow, daysRow);
    root.append(this.container);

    this.updateClock();
  }

  get value(): number {
    return Number(this.slider.value);
  }

  private makeButton(text: string, onClick: () => void, title?: string): HTMLButtonElement {
    const btn = el('button', 'control-btn');
    btn.type = 'button';
    btn.textContent = text;
    if (title) btn.title = title;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private stepBy(deltaMin: number): void {
    const span = this.opts.max - this.opts.min + 1;
    let next = (this.value - this.opts.min + deltaMin) % span;
    if (next < 0) next += span;
    this.slider.value = String(this.opts.min + next);
    this.emit();
  }

  private jumpTo(targetMin: number): void {
    const clamped = Math.max(this.opts.min, Math.min(this.opts.max, targetMin));
    this.slider.value = String(clamped);
    this.emit();
  }

  toggle(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.playBtn.classList.remove('is-playing');
      this.playBtn.innerHTML = '<span class="btn-icon">▶</span> <span class="btn-label">PLAY</span>';
      return;
    }
    this.playBtn.classList.add('is-playing');
    this.playBtn.innerHTML = '<span class="btn-icon">❚❚</span> <span class="btn-label">PAUSE</span>';
    this.timer = setInterval(() => this.advance(), this.opts.tickMs);
  }

  private advance(): void {
    const span = this.opts.max - this.opts.min + 1;
    const next = this.opts.min + ((this.value - this.opts.min + this.currentStepMin) % span);
    this.slider.value = String(next);
    this.emit();
  }

  private emit(): void {
    this.updateClock();
    this.opts.onChange(this.value);
  }

  private updateClock(): void {
    const current = this.value;
    const dayIndex = Math.floor(current / 1440);
    const minuteOfDay = current % 1440;
    const day = DAY_NAMES[((dayIndex % 7) + 7) % 7] ?? 'Mon';
    const time = formatHourMin(minuteOfDay);

    this.dayPill.textContent = day.toUpperCase();
    this.timeDigits.textContent = `${time}:00`;
    this.periodTag.textContent = timePeriod(minuteOfDay).toUpperCase();
    this.minIndex.textContent = `T+${String(current).padStart(5, '0')}m`;

    // Highlight active day jump button
    const dayBtns = this.dayJumpGroup.children;
    for (let i = 0; i < dayBtns.length; i++) {
      if (i === dayIndex) dayBtns[i]?.classList.add('is-active');
      else dayBtns[i]?.classList.remove('is-active');
    }
  }
}
