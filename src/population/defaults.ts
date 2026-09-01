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
  streetDensity: number;
  defaultHeadwayMin: number;
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
    streetDensity: params?.streetDensity ?? 1,
    defaultHeadwayMin: params?.defaultHeadwayMin ?? 12,
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

/**
 * Land-use pull on the pavement in front of a parcel, relative to a bare
 * street (1). Retail and food frontage draws the most foot traffic, offices
 * draw peaks at their own hours, industry and barracks draw almost none.
 */
export const STREET_PULL_BY_TYPE: Partial<Record<ParcelType, number>> = {
  coffee_shop: 3,
  restaurant: 3,
  commerce: 3,
  mall: 4,
  hotel: 2,
  offices: 1.5,
  corpo: 1.5,
  clinic: 1.5,
  hospital: 1.5,
  residential: 0.6,
  police: 0.5,
  military: 0.3,
  factory: 0.4,
};

/** How far a door's pull reaches along the street, meters. */
export const PULL_RADIUS_M = 60;

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
  /** Minute of day the rota starts; close < open spans midnight. */
  open: number;
  /** Minute of day the place closes. Equal to open when allDay. */
  close: number;
  /** Continuous operation: three 8 h waves anchored at open. */
  allDay: boolean;
  /** Weekdays the place operates, 0 = Monday. */
  days: number[];
  /** desk: one standard day shift for everyone. rota: waves tile the open span. */
  model: 'desk' | 'rota';
  /** Fraction of parcels of this type that instead run night-only hours. */
  nightOnlyChance: number;
}

const H = 60;

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS = [0, 1, 2, 3, 4];
export const SIX_DAYS = [0, 1, 2, 3, 4, 5];

/** Days one person works per week (ILO/BLS full-time norm). */
export const WORK_DAYS_PER_WEEK = 5;

/** Longest single shift, minutes; longer spans are tiled by more waves. */
export const MAX_SHIFT_MIN = 8 * H;

/** Standard office day including the break. */
export const DESK_SHIFT_MIN = 9 * H;

/**
 * Opening hours and staffing model by workplace type. 24/7 types run the
 * classic 06-14-22 three-wave rota plus security; service types tile their
 * open span with waves so a customer always meets staff; desk types put
 * everyone on one day shift.
 */
export const OPENING_BY_TYPE: Partial<Record<ParcelType, OpeningProfile>> = {
  hotel: { open: 6 * H, close: 6 * H, allDay: true, days: ALL_DAYS, model: 'rota', nightOnlyChance: 0 },
  hospital: { open: 6 * H, close: 6 * H, allDay: true, days: ALL_DAYS, model: 'rota', nightOnlyChance: 0 },
  police: { open: 6 * H, close: 6 * H, allDay: true, days: ALL_DAYS, model: 'rota', nightOnlyChance: 0 },
  military: { open: 6 * H, close: 6 * H, allDay: true, days: ALL_DAYS, model: 'rota', nightOnlyChance: 0 },
  factory: { open: 6 * H, close: 22 * H, allDay: false, days: SIX_DAYS, model: 'rota', nightOnlyChance: 0 },
  offices: { open: 8 * H, close: 19 * H, allDay: false, days: WEEKDAYS, model: 'desk', nightOnlyChance: 0 },
  corpo: { open: 7 * H, close: 21 * H, allDay: false, days: WEEKDAYS, model: 'desk', nightOnlyChance: 0 },
  clinic: { open: 8 * H, close: 18 * H, allDay: false, days: SIX_DAYS, model: 'rota', nightOnlyChance: 0 },
  commerce: { open: 9 * H, close: 19 * H, allDay: false, days: ALL_DAYS, model: 'rota', nightOnlyChance: 0 },
  mall: { open: 10 * H, close: 21 * H, allDay: false, days: ALL_DAYS, model: 'rota', nightOnlyChance: 0 },
  restaurant: { open: 11 * H, close: 24 * H - 1, allDay: false, days: ALL_DAYS, model: 'rota', nightOnlyChance: 0.25 },
  coffee_shop: { open: 6 * H, close: 18 * H, allDay: false, days: ALL_DAYS, model: 'rota', nightOnlyChance: 0 },
};

/**
 * Night-only venue hours (bars, night restaurants). 24/7 coverage arithmetic
 * (one continuously staffed post = 168h / 40h = 4.2 FTE plus relief, so 5-6
 * people) comes out of the rota structurally: 3 waves x 2 day crews = 6.
 */
export const NIGHT_ONLY_HOURS = { open: 18 * H, close: 2 * H };
