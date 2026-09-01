/**
 * Housing stock: residential units per parcel estimated from floor area and
 * the tier's unit size, grouped by district and tier. The blueprint's own
 * population figure is the world's truth, so the estimate takes a calibration
 * factor (calibration.ts) before the demographic pass reads it.
 */

import { hash01 } from '../core/rng.js';
import { polygonArea } from '../world/geo.js';
import { UNIT_AREA_BY_TIER } from './defaults.js';
import type { CityBlueprint, Parcel, WealthTier } from '../schemas/blueprint.js';

export interface ResidentialBlock {
  parcelId: string;
  units: number;
  unitOffset: number;
}

/** Residential parcels of one district and tier: the demographic grouping unit. */
export interface Group {
  index: number;
  districtId: string;
  tier: WealthTier;
  blocks: ResidentialBlock[];
  totalUnits: number;
}

interface RawGroup {
  districtId: string;
  tier: WealthTier;
  blocks: { parcelId: string; units: number }[];
}

const TIER_ORDER: WealthTier[] = ['poor', 'mid', 'rich', 'high_rich'];

export class HousingStock {
  private readonly raw: RawGroup[] = [];

  constructor(seed: string | number, blueprint: CityBlueprint) {
    const districts = [...blueprint.districts].sort(byId);
    const parcels = blueprint.parcels.filter((p) => p.type === 'residential').sort(byId);
    for (const district of districts) {
      for (const tier of TIER_ORDER) {
        const blocks = parcels
          .filter((p) => p.districtId === district.id && p.tier === tier)
          .map((p) => ({ parcelId: p.id, units: estimateUnits(seed, p) }));
        if (blocks.length > 0) this.raw.push({ districtId: district.id, tier, blocks });
      }
    }
  }

  /** The groups with every block's units scaled by factor; a block never drops below one unit. */
  groups(factor: number): Group[] {
    return this.raw.map((g, index) => {
      let offset = 0;
      const blocks = g.blocks.map((b) => {
        const units = Math.max(1, Math.round(b.units * factor));
        const block: ResidentialBlock = { parcelId: b.parcelId, units, unitOffset: offset };
        offset += units;
        return block;
      });
      return { index, districtId: g.districtId, tier: g.tier, blocks, totalUnits: offset };
    });
  }
}

function estimateUnits(seed: string | number, p: Parcel): number {
  const floors =
    p.envelope.minFloors + Math.floor(hash01(seed, 'floors', p.id) * (p.envelope.maxFloors - p.envelope.minFloors + 1));
  const perFloor = Math.max(1, Math.floor(polygonArea(p.footprint) / UNIT_AREA_BY_TIER[p.tier]));
  return floors * perFloor;
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : 1;
}
