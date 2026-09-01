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
  /** Share of NPCs assigned female. 0 or 1 makes a single-gender population. */
  femaleShare?: number;
  /**
   * Share of couple households whose two partners share a gender. Drawn once
   * per household, so partner genders are not independent (see
   * docs/RESEARCH.md). Roommates, singles and kids keep the individual
   * `femaleShare` draw.
   */
  sameGenderCoupleShare?: number;
  /** Household composition weights, normalized internally. */
  householdMix?: HouseholdMix;
  /** Work schedule weights, normalized internally. */
  shiftMix?: ShiftMix;
  /**
   * Multiplier on how many people are out in public space. 1 is the
   * research-calibrated share of the population outdoors by hour (see
   * docs/RESEARCH.md); raise it for a busier looking city, lower it for a
   * sleepy one. Sane range 0.25 to 4.
   */
  streetDensity?: number;
  /** Fallback transit headway in minutes when the networks input is absent. */
  defaultHeadwayMin?: number;
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
