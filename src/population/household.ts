/**
 * Household shapes: the deterministic form (single, couple, family, shared)
 * of every household, keyed by group and household index, with running adult
 * and kid totals so any household count of a group resolves to a population
 * in O(1). Shared by housing calibration and the demographic pass.
 */

import { rand } from '../core/rng.js';
import { KIDS_COUNT_WEIGHTS, SHARED_SIZE_WEIGHTS, type ResolvedParams } from './defaults.js';

export type HouseholdForm = 'single' | 'couple' | 'coupleKids' | 'singleParent' | 'shared';

export interface HouseholdShape {
  form: HouseholdForm;
  adults: number;
  kids: number;
}

type HouseholdMix = ResolvedParams['householdMix'];

const FORMS: HouseholdForm[] = ['single', 'couple', 'coupleKids', 'singleParent', 'shared'];

export function householdShape(seed: string | number, mix: HouseholdMix, groupIdx: number, h: number): HouseholdShape {
  const r = rand(seed, 'hh', groupIdx, h);
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

export class HouseholdLedger {
  /** Per group: entry n is the count in households [0, n); grown on demand. */
  private readonly adults: number[][] = [];
  private readonly kids: number[][] = [];

  constructor(
    private readonly seed: string | number,
    private readonly mix: HouseholdMix,
  ) {}

  shape(groupIdx: number, h: number): HouseholdShape {
    return householdShape(this.seed, this.mix, groupIdx, h);
  }

  adultsBefore(groupIdx: number, n: number): number {
    this.extend(groupIdx, n);
    return this.adults[groupIdx]![n]!;
  }

  kidsBefore(groupIdx: number, n: number): number {
    this.extend(groupIdx, n);
    return this.kids[groupIdx]![n]!;
  }

  private extend(groupIdx: number, n: number): void {
    while (this.adults.length <= groupIdx) {
      this.adults.push([0]);
      this.kids.push([0]);
    }
    const adults = this.adults[groupIdx]!;
    const kids = this.kids[groupIdx]!;
    for (let h = adults.length - 1; h < n; h++) {
      const shape = this.shape(groupIdx, h);
      adults.push(adults[h]! + shape.adults);
      kids.push(kids[h]! + shape.kids);
    }
  }
}
