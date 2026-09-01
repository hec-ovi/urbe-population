/**
 * NPC type surface. Naming owns the final schema (its Out); this fixture shape
 * stands in until naming publishes, then an adapter maps theirs onto this.
 * A built-in default type set ships for standalone runs.
 */

import type { ParcelType, WealthTier } from './blueprint.js';
import type { InteriorRoleName } from './interiors.js';

export interface NPCTypeDef {
  /** Themed type string, e.g. "barista", "corpo_worker". */
  type: string;
  category: NPCCategory;
  /** Relative demographic weight within its category. */
  weight: number;
  /** Parcel types this type works at; worker category only. */
  workplaceTypes?: ParcelType[];
  /** Interior role this type staffs when the building has an NpcSupport instance. */
  interiorRole?: InteriorRoleName;
  /** Wealth tiers this type appears in; absent = all. */
  tiers?: WealthTier[];
}

/**
 * worker: employed, has a job, shift and commute.
 * resident: home-centric, no job (unemployed, retired, homemaker).
 * transient: visitor feeding commerce and street crowds, no home in this city.
 */
export type NPCCategory = 'worker' | 'resident' | 'transient';

/** Names repeat across NPCs by design; pools may be themed by the naming layer. */
export interface NamePool {
  given: string[];
  family: string[];
}
