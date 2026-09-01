/** Clean toast notifications with square dark technical styling and fast animations. */

import { el } from './dom.js';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  message: string;
  title?: string;
  type?: ToastType;
  durationMs?: number;
}

export class ToastManager {
  private static instance: ToastManager | undefined;
  private readonly container: HTMLElement;
  private readonly maxToasts = 5;

  private constructor() {
    let existing = document.getElementById('toast-container');
    if (!existing) {
      existing = el('div', 'toast-container');
      existing.id = 'toast-container';
      document.body.appendChild(existing);
    }
    this.container = existing;
  }

  static get(): ToastManager {
    if (!ToastManager.instance) {
      ToastManager.instance = new ToastManager();
    }
    return ToastManager.instance;
  }

  show(opts: ToastOptions): void {
    const type = opts.type ?? 'info';
    const durationMs = opts.durationMs ?? 3500;

    // Limit active toasts
    while (this.container.children.length >= this.maxToasts) {
      const first = this.container.firstElementChild;
      if (first) this.dismiss(first as HTMLElement);
      else break;
    }

    const toast = el('div', `toast toast-${type}`);

    // Indicator tag / type
    const header = el('div', 'toast-header');
    const badge = el('span', `toast-tag toast-tag-${type}`);
    badge.textContent = (opts.title ?? type).toUpperCase();

    const time = el('span', 'toast-time');
    const now = new Date();
    time.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const closeBtn = el('button', 'toast-close');
    closeBtn.type = 'button';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close toast');

    header.append(badge, time, closeBtn);

    const body = el('div', 'toast-body');
    body.textContent = opts.message;

    toast.append(header, body);
    this.container.appendChild(toast);

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (durationMs > 0) {
      timer = setTimeout(() => this.dismiss(toast), durationMs);
    }

    closeBtn.addEventListener('click', () => {
      if (timer) clearTimeout(timer);
      this.dismiss(toast);
    });
  }

  private dismiss(toast: HTMLElement): void {
    if (toast.classList.contains('is-dismissing')) return;
    toast.classList.add('is-dismissing');
    toast.addEventListener('animationend', () => {
      toast.remove();
    }, { once: true });
    // Fallback if animationend doesn't trigger
    setTimeout(() => toast.remove(), 250);
  }

  info(message: string, title?: string): void {
    this.show({ message, title: title ?? 'INFO', type: 'info' });
  }

  success(message: string, title?: string): void {
    this.show({ message, title: title ?? 'OK', type: 'success' });
  }

  warn(message: string, title?: string): void {
    this.show({ message, title: title ?? 'WARN', type: 'warning' });
  }

  error(message: string, title?: string): void {
    this.show({ message, title: title ?? 'ERROR', type: 'error', durationMs: 5000 });
  }
}

export const toast = ToastManager.get();
