import type { ElementSpec, ViewActions, ViewData } from './schema.js';

export function render(root: HTMLElement, layout: ElementSpec[], data: ViewData = {}, actions: ViewActions = {}): void {
  root.replaceChildren(...layout.flatMap((spec) => elements(spec, data, actions)));
}

function elements(spec: ElementSpec, data: ViewData, actions: ViewActions): HTMLElement[] {
  if (spec.when && !valueAt(data, spec.when)) return [];
  if (spec.each) {
    const { each, ...itemSpec } = spec;
    const items = valueAt(data, each) as ViewData[];
    return items.flatMap((item) => elements(itemSpec, { ...data, ...item }, actions));
  }
  const node = document.createElement(spec.tag);
  if (spec.className) node.className = fill(spec.className, data);
  if (spec.text) node.textContent = fill(spec.text, data);
  for (const [name, value] of Object.entries(spec.attrs ?? {})) node.setAttribute(name, fill(String(value), data));
  if (spec.action) {
    const action = actions[spec.action];
    if (!action) throw new Error(`Unknown view action: ${spec.action}`);
    node.addEventListener(spec.event ?? 'click', (event) => action(event, data));
  }
  node.append(...(spec.children ?? []).flatMap((child) => elements(child, data, actions)));
  return [node];
}

function fill(text: string, data: ViewData): string {
  return text.replace(/\{\{([\w.]+)\}\}/g, (_, key: string) => String(valueAt(data, key) ?? ''));
}

function valueAt(data: ViewData, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (value as ViewData | undefined)?.[key], data);
}
