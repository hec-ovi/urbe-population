/** DOM primitives shared by every view and widget. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Element the page skeleton must provide; throws when the markup drifts. */
export function mountPoint<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`testbed: missing #${id} in index.html`);
  return node as T;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

/** Create a span with text and optional class. */
export function span(text: string, className?: string): HTMLSpanElement {
  const node = el('span', className);
  node.textContent = text;
  return node;
}

/** Create a badge element. */
export function badge(text: string, variant: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted' = 'muted'): HTMLElement {
  const node = el('span', `badge badge-${variant}`);
  node.textContent = text;
  return node;
}

/** Create a key-value row element. */
export function kvRow(key: string, value: string | HTMLElement, valueClass?: string): HTMLElement {
  const row = el('div', 'kv-row');
  const keyEl = el('span', 'kv-key');
  keyEl.textContent = key;
  row.append(keyEl);

  if (typeof value === 'string') {
    const valEl = el('span', valueClass ? `kv-val ${valueClass}` : 'kv-val');
    valEl.textContent = value;
    row.append(valEl);
  } else {
    row.append(value);
  }
  return row;
}
