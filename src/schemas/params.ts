/**
 * Statistical overrides. Every field optional; defaults come from real
 * demographic statistics, documented with sources in docs/RESEARCH.md and
 * resolved in src/population/defaults.ts.
 */

export interface SimulationParams {
  /** Fraction of residential capacity occupied. */
  occupancyRate?: number;
  /** Fraction of the labor force without a job. */
  unemploymentRate?: number;
  /** Household composition weights, normalized internally. */
  householdMix?: HouseholdMix;
  /** Work schedule weights, normalized internally. */
  shiftMix?: ShiftMix;
  /** Multiplier on ambient crowd density. Default 1. */
  crowdScale?: number;
  /** Fallback transit headway in minutes when the paths input is absent. */
  defaultHeadwayMin?: number;
  /** Max CrowdAgent descriptors returned per crowd() call. */
  agentCap?: number;
}

export interface HouseholdMix {
  single?: number;
  couple?: number;
  coupleKids?: number;
  singleParent?: number;
  shared?: number;
}

export interface ShiftMix {
  day?: number;
  evening?: number;
  night?: number;
  rotating?: number;
}
