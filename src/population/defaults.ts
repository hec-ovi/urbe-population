/**
 * Statistical defaults from real demographic sources (see docs/RESEARCH.md):
 * ACS 2024 households and commuting, BLS shift prevalence, standard 24/7
 * coverage arithmetic. Every value is overridable via SimulationParams.
 */

import type { ParcelType, WealthTier } from '../schemas/blueprint.js';
import type { SimulationParams } from '../schemas/params.js';

export interface ResolvedParams {
  occupancyRate: number;
  unemploymentRate: number;
  laborForceParticipation: number;
  householdMix: { single: number; couple: number; coupleKids: number; singleParent: number; shared: number };
  shiftMix: { day: number; evening: number; night: number; rotating: number };
  crowdScale: number;
  defaultHeadwayMin: number;
  agentCap: number;
}

export function resolveParams(params?: SimulationParams): ResolvedParams {
  return {
    occupancyRate: params?.occupancyRate ?? 0.55,
    unemploymentRate: params?.unemploymentRate ?? 0.041,
    laborForceParticipation: 0.64,
    householdMix: {
      single: params?.householdMix?.single ?? 0.29,
      couple: params?.householdMix?.couple ?? 0.27,
      coupleKids: params?.householdMix?.coupleKids ?? 0.21,
      singleParent: params?.householdMix?.singleParent ?? 0.1,
      shared: params?.householdMix?.shared ?? 0.13,
    },
    shiftMix: {
      day: params?.shiftMix?.day ?? 0.84,
      evening: params?.shiftMix?.evening ?? 0.06,
      night: params?.shiftMix?.night ?? 0.04,
      rotating: params?.shiftMix?.rotating ?? 0.06,
    },
    crowdScale: params?.crowdScale ?? 1,
    defaultHeadwayMin: params?.defaultHeadwayMin ?? 12,
    agentCap: params?.agentCap ?? 200,
  };
}

/** Kids per household with kids: 1 / 2 / 3 (Eurostat). */
export const KIDS_COUNT_WEIGHTS = [0.502, 0.376, 0.122];

/** Adults in a shared household: 2 / 3 / 4. */
export const SHARED_SIZE_WEIGHTS = [0.6, 0.3, 0.1];

/** Residential unit floor area by tier, square meters. */
export const UNIT_AREA_BY_TIER: Record<WealthTier, number> = {
  poor: 45,
  mid: 70,
  rich: 110,
  high_rich: 180,
};

/** Floor area per worker by workplace type, square meters. */
export const AREA_PER_WORKER: Partial<Record<ParcelType, number>> = {
  hotel: 40,
  offices: 15,
  corpo: 20,
  hospital: 25,
  clinic: 20,
  police: 25,
  military: 35,
  factory: 40,
  commerce: 30,
  mall: 35,
  restaurant: 15,
  coffee_shop: 12,
};

export interface OpeningProfile {
  /** Minute of day; close < open spans midnight. Ignored when allDay. */
  open: number;
  close: number;
  allDay: boolean;
  /** Fraction of parcels of this type that instead run night-only hours. */
  nightOnlyChance: number;
}

const H = 60;

/** Opening hours by workplace type. 24/7 types staff three shifts plus security. */
export const OPENING_BY_TYPE: Partial<Record<ParcelType, OpeningProfile>> = {
  hotel: { open: 0, close: 0, allDay: true, nightOnlyChance: 0 },
  hospital: { open: 0, close: 0, allDay: true, nightOnlyChance: 0 },
  police: { open: 0, close: 0, allDay: true, nightOnlyChance: 0 },
  military: { open: 0, close: 0, allDay: true, nightOnlyChance: 0 },
  factory: { open: 6 * H, close: 22 * H, allDay: false, nightOnlyChance: 0 },
  offices: { open: 8 * H, close: 19 * H, allDay: false, nightOnlyChance: 0 },
  corpo: { open: 7 * H, close: 21 * H, allDay: false, nightOnlyChance: 0 },
  clinic: { open: 8 * H, close: 18 * H, allDay: false, nightOnlyChance: 0 },
  commerce: { open: 9 * H, close: 19 * H, allDay: false, nightOnlyChance: 0 },
  mall: { open: 10 * H, close: 21 * H, allDay: false, nightOnlyChance: 0 },
  restaurant: { open: 11 * H, close: 24 * H - 1, allDay: false, nightOnlyChance: 0.25 },
  coffee_shop: { open: 6 * H, close: 18 * H, allDay: false, nightOnlyChance: 0 },
};

/** Night-only venue hours (bars, night restaurants). */
export const NIGHT_ONLY_HOURS = { open: 18 * H, close: 2 * H };

/**
 * 24/7 coverage: one continuously staffed post = 168h / 40h = 4.2 FTE,
 * times a 1.2 relief factor, so ~5 employees per post.
 */
export const FTE_PER_247_POST = 4.2;
export const RELIEF_FACTOR = 1.2;
