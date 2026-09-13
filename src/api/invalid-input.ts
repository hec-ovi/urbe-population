import { SimulationError } from '../schemas/errors.js';

export function fail(field: string, why: string): never {
  throw new SimulationError('E_INVALID_INPUT', `${field}: ${why}`, { field });
}

