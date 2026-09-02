/**
 * Aggregate population statistics: the demographic ground truth every lazy
 * instantiation stays consistent with. Consumed by naming to create themed
 * NPC types and by the engine for density tuning.
 */

import type { ParcelType, WealthTier } from './blueprint.js';
import type { NPCCategory } from './npc-types.js';

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
  /**
   * Job roles the typed set has no admitting category for, so their workers
   * take a type from outside it. Empty when the set covers the city.
   */
  typeGaps: TypeGap[];
  perDistrict: DistrictPopulation[];
}

/** A staffed role the typed set cannot type from a category that admits it. */
export interface TypeGap {
  role: string;
  /** Categories that would have admitted the role, best first. */
  categories: NPCCategory[];
  /** Parcel types where the role is staffed. */
  parcelTypes: ParcelType[];
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
