/**
 * Aggregate population statistics: the demographic ground truth every lazy
 * instantiation stays consistent with. Consumed by naming to create themed
 * NPC types and by the engine for density tuning.
 */

import type { WealthTier } from './blueprint.js';

export interface PopulationStats {
  /** Total residents. */
  population: number;
  households: number;
  employed: number;
  unemployed: number;
  /** NPC type -> count, city wide. */
  typeCounts: Record<string, number>;
  /**
   * Multiplier applied to the housing stock estimated from residential floor
   * area so residents match the blueprint's stats.population within 3
   * percent. 1 when the blueprint carries no figure or the estimate already
   * agreed.
   */
  calibrationFactor: number;
  perDistrict: DistrictPopulation[];
}

export interface DistrictPopulation {
  districtId: string;
  population: number;
  households: number;
  byTier: Partial<Record<WealthTier, TierPopulation>>;
}

export interface TierPopulation {
  population: number;
  households: number;
  employed: number;
  unemployed: number;
  /** NPC type -> count within this district and tier. */
  typeCounts: Record<string, number>;
}
