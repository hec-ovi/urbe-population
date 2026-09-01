/**
 * Household structure pass: for every district/tier group, the household
 * count and the offsets that give every adult and kid a stable identity.
 * This is the only O(population) pass; everything per-NPC stays lazy.
 */

import { lastAtMost } from '../core/search.js';
import type { ResolvedParams } from './defaults.js';
import type { HouseholdLedger, HouseholdShape } from './household.js';
import type { WorldModel } from '../world/model.js';

interface GroupIndex {
  households: number;
  adultOffset: number;
  kidOffset: number;
}

export class Demographics {
  private readonly groupIndex: GroupIndex[] = [];
  readonly totalAdults: number;
  readonly totalKids: number;
  readonly totalHouseholds: number;

  constructor(
    world: WorldModel,
    private readonly ledger: HouseholdLedger,
    params: ResolvedParams,
  ) {
    let adultOffset = 0;
    let kidOffset = 0;
    let households = 0;
    for (const group of world.groups) {
      const count = Math.floor(group.totalUnits * params.occupancyRate);
      this.groupIndex.push({ households: count, adultOffset, kidOffset });
      adultOffset += ledger.adultsBefore(group.index, count);
      kidOffset += ledger.kidsBefore(group.index, count);
      households += count;
    }
    this.totalAdults = adultOffset;
    this.totalKids = kidOffset;
    this.totalHouseholds = households;
  }

  get totalPopulation(): number {
    return this.totalAdults + this.totalKids;
  }

  householdShape(groupIdx: number, h: number): HouseholdShape {
    return this.ledger.shape(groupIdx, h);
  }

  households(groupIdx: number): number {
    return this.groupIndex[groupIdx]!.households;
  }

  groupAdults(groupIdx: number): number {
    return this.ledger.adultsBefore(groupIdx, this.households(groupIdx));
  }

  groupKids(groupIdx: number): number {
    return this.ledger.kidsBefore(groupIdx, this.households(groupIdx));
  }

  adultIndexOf(groupIdx: number, h: number, member: number): number {
    return this.groupIndex[groupIdx]!.adultOffset + this.ledger.adultsBefore(groupIdx, h) + member;
  }

  /** Inverse of adultIndexOf. */
  locateAdult(adultIdx: number): { groupIdx: number; h: number; member: number } {
    const groupIdx = lastAtMost(this.groupIndex.length, (i) => this.groupIndex[i]!.adultOffset, adultIdx);
    const local = adultIdx - this.groupIndex[groupIdx]!.adultOffset;
    const h = lastAtMost(this.households(groupIdx), (i) => this.ledger.adultsBefore(groupIdx, i), local);
    return { groupIdx, h, member: local - this.ledger.adultsBefore(groupIdx, h) };
  }
}
