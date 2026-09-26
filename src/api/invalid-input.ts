import { SimulationError } from '../schemas/errors.js';

export function fail(field: string, why: string): never {
  throw new SimulationError('E_INVALID_INPUT', `${field}: ${why}`, { field });
}

/** A body seed is an unsigned 32-bit integer, the range every drawn appearanceSeed has. */
export function checkAppearanceSeed(field: string, value: unknown): void {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 0xffffffff) {
    fail(field, 'must be an integer from 0 to 4294967295');
  }
}
