/**
 * Consumer projection of the themed NPC type set produced by naming. Every
 * naming-produced set fits this shape; host-authored sets may additionally omit
 * gender buckets or overlap them. A built-in default set ships for standalone
 * runs. Name pool precedence: the explicit namePool input override, else the
 * set's embedded pool, else the built-in default.
 */

import type { ParcelType, WealthTier } from './blueprint.js';

export interface NPCTypeSet {
  meta: {
    theme: string;
    worldSeed: string | number;
    createdAt: string;
    model?: string;
  };
  types: NPCTypeDef[];
  /** Themed pool; family entries may be epithets or patronymics. Min 20 each. */
  namePool: NamePool;
}

export interface NPCTypeDef {
  /** Unique machine string, e.g. "dock_smuggler". */
  type: string;
  label: string;
  category: NPCCategory;
  /** Prompt boilerplate consumers use to instantiate an NPC of this type. */
  boilerplate: string;
  /** Short themed instantiation sketches for downstream few-shot use. */
  examples?: string[];
  /** What in the named world this type is anchored to. */
  grounding: NPCGrounding;
  /** Relative demographic weight within its category; normalized here. */
  weight: number;
}

/**
 * Scheduling archetype per category:
 * resident: home-centric, no job. worker: employed at a workplace parcel with
 * shift and commute. vendor: staffs commerce counters. authority: police,
 * military, security; patrols and night coverage. transit: drivers and station
 * staff, tied to service hours. street: street presence, no job, may lack a home.
 */
export type NPCCategory = 'resident' | 'worker' | 'vendor' | 'authority' | 'transit' | 'street';

export interface NPCGrounding {
  /** District names from the named world. */
  districts?: string[];
  parcelTypes?: ParcelType[];
  tiers?: WealthTier[];
}

/** Names repeat across NPCs by design. */
export interface NamePool {
  /** Flat fallback list. Naming output supplies the deduped union of its buckets. */
  given: string[];
  /**
   * Given names per gender. Naming output partitions each name into exactly
   * one bucket. Host-authored pools may overlap them so one name is directly
   * drawable by several genders. Absent means everyone draws from `given`.
   */
  givenByGender?: GivenByGender;
  family: string[];
}

export interface GivenByGender {
  male: string[];
  female: string[];
  /** Names that fit anyone; an all-neutral theme puts every name here. */
  neutral: string[];
}
