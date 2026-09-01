/**
 * Household structure pass: for every district/tier group, deterministic
 * household forms and the prefix indices that give every adult and kid a
 * stable identity. This is the only O(population) pass; everything per-NPC
 * stays lazy.
 */

import { rand } from '../core/rng.js';
import { lastAtMost } from '../core/search.js';
import { KIDS_COUNT_WEIGHTS, SHARED_SIZE_WEIGHTS, type ResolvedParams } from './defaults.js';
import type { WorldModel } from '../world/model.js';

export type HouseholdForm = 'single' | 'couple' | 'coupleKids' | 'singleParent' | 'shared';

export interface HouseholdShape {
  form: HouseholdForm;
  adults: number;
  kids: number;
}

interface GroupIndex {
  households: number;
  adultOffset: number;
  kidOffset: number;
  /** adultPrefix[h] = adults in households [0, h) of this group. */
  adultPrefix: Int32Array;
  kidPrefix: Int32Array;
}

const FORMS: HouseholdForm[] = ['single', 'couple', 'coupleKids', 'singleParent', 'shared'];

export class Demographics {
  private readonly groupIndex: GroupIndex[] = [];
  readonly totalAdults: number;
  readonly totalKids: number;
  readonly totalHouseholds: number;

  constructor(
    private readonly seed: string | number,
    private readonly world: WorldModel,
    private readonly params: ResolvedParams,
  ) {
    let adultOffset = 0;
    let kidOffset = 0;
    let households = 0;
    for (const group of world.groups) {
      const count = Math.floor(group.totalUnits * params.occupancyRate);
      const adultPrefix = new Int32Array(count + 1);
      const kidPrefix = new Int32Array(count + 1);
      for (let h = 0; h < count; h++) {
        const shape = this.householdShape(group.index, h);
        adultPrefix[h + 1] = adultPrefix[h]! + shape.adults;
        kidPrefix[h + 1] = kidPrefix[h]! + shape.kids;
      }
      this.groupIndex.push({ households: count, adultOffset, kidOffset, adultPrefix, kidPrefix });
      adultOffset += adultPrefix[count]!;
      kidOffset += kidPrefix[count]!;
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
    const r = rand(this.seed, 'hh', groupIdx, h);
    const mix = this.params.householdMix;
    const form = FORMS[r.weighted([mix.single, mix.couple, mix.coupleKids, mix.singleParent, mix.shared])]!;
    switch (form) {
      case 'single':
        return { form, adults: 1, kids: 0 };
      case 'couple':
        return { form, adults: 2, kids: 0 };
      case 'coupleKids':
        return { form, adults: 2, kids: 1 + r.weighted(KIDS_COUNT_WEIGHTS) };
      case 'singleParent':
        return { form, adults: 1, kids: 1 + r.weighted(KIDS_COUNT_WEIGHTS) };
      case 'shared':
        return { form, adults: 2 + r.weighted(SHARED_SIZE_WEIGHTS), kids: 0 };
    }
  }

  households(groupIdx: number): number {
    return this.groupIndex[groupIdx]!.households;
  }

  groupAdults(groupIdx: number): number {
    const g = this.groupIndex[groupIdx]!;
    return g.adultPrefix[g.households]!;
  }

  groupKids(groupIdx: number): number {
    const g = this.groupIndex[groupIdx]!;
    return g.kidPrefix[g.households]!;
  }

  adultIndexOf(groupIdx: number, h: number, member: number): number {
    const g = this.groupIndex[groupIdx]!;
    return g.adultOffset + g.adultPrefix[h]! + member;
  }

  /** Inverse of adultIndexOf. */
  locateAdult(adultIdx: number): { groupIdx: number; h: number; member: number } {
    const groupIdx = lastAtMost(this.groupIndex.length, (i) => this.groupIndex[i]!.adultOffset, adultIdx);
    const g = this.groupIndex[groupIdx]!;
    const local = adultIdx - g.adultOffset;
    const h = lastAtMost(g.households, (i) => g.adultPrefix[i]!, local);
    return { groupIdx, h, member: local - g.adultPrefix[h]! };
  }
}
