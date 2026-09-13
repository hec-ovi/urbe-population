import { TestbedError } from '../errors.js';

export function mountPoint<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new TestbedError('E_MOUNT_UNAVAILABLE', `missing #${id} in index.html`);
  return node as T;
}
