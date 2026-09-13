import layout from './toast.json' with { type: 'json' };
import { render } from '../ui/element.js';
import type { ElementSpec } from '../ui/schema.js';

class ToastManager {
  private show(message: string, title: string, type: string): void {
    const container = document.getElementById('toast-container');
    if (!container) return;
    while (container.children.length >= 5) container.firstElementChild!.remove();
    const node = document.createElement('div');
    node.className = `toast toast-${type}`;
    const timer = setTimeout(() => node.remove(), 3500);
    render(node, layout as ElementSpec[], { message, title, type }, {
      close: () => { clearTimeout(timer); node.remove(); },
    });
    container.append(node);
  }

  info(message: string, title = 'INFO'): void { this.show(message, title, 'info'); }
  success(message: string, title = 'OK'): void { this.show(message, title, 'success'); }
  warn(message: string, title = 'WARN'): void { this.show(message, title, 'warning'); }
}

export const toast = new ToastManager();
