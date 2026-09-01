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
