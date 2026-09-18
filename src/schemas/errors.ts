/** Closed set of Simulation domain errors. */

export type SimulationErrorCode =
  | 'E_INVALID_INPUT'
  | 'E_UNKNOWN_ID'
  | 'E_STALE_HANDLE'
  | 'E_NO_MATCH'
  | 'E_DEAD'
  | 'E_CONFLICT'
  | 'E_CAPACITY'
  | 'E_TIME';

export class SimulationError extends Error {
  readonly code: SimulationErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: SimulationErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SimulationError';
    this.code = code;
    this.details = details;
  }
}
