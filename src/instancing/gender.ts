/**
 * Gender assignment. Singles, single parents, roommates and kids draw
 * individually against the sex ratio, keyed by npcId alone. A couple is one
 * household-level draw instead: the two partners get opposite genders unless
 * the household falls in `sameGenderCoupleShare`. Both paths key off stable
 * ids, so a family stub, its full instance and its crowd agent agree whatever
 * order people are instantiated in.
 */

import { hash01, type Rand } from '../core/rng.js';
import { parseAdultId } from './ids.js';
import type { Demographics } from '../population/demographics.js';
import type { HouseholdForm } from '../population/household.js';
import type { Gender } from '../schemas/npc.js';

export interface GenderParams {
  femaleShare: number;
  sameGenderCoupleShare: number;
}

const COUPLE_FORMS = new Set<HouseholdForm>(['couple', 'coupleKids']);

export function pickGender(seed: string | number, femaleShare: number, npcId: string): Gender {
  return genderOf(hash01(seed, 'gender', npcId) < femaleShare);
}

/**
 * Gender of one partner in a two-adult couple household. `member` is 0 or 1;
 * a mixed-gender couple gives the two opposite genders, a same-gender couple
 * gives both the one drawn against the sex ratio. A single-gender population
 * (femaleShare 0 or 1) has no mixed couples to draw.
 */
export function pickCoupleGender(
  seed: string | number,
  params: GenderParams,
  householdId: string,
  member: number,
): Gender {
  const mixedPossible = params.femaleShare > 0 && params.femaleShare < 1;
  if (!mixedPossible || hash01(seed, 'couplekind', householdId) < params.sameGenderCoupleShare) {
    return genderOf(hash01(seed, 'couplegender', householdId) < params.femaleShare);
  }
  const firstFemale = hash01(seed, 'coupleorder', householdId) < 0.5;
  return genderOf(member === 0 ? firstFemale : !firstFemale);
}

export class GenderResolver {
  constructor(
    private readonly seed: string | number,
    private readonly demo: Demographics,
    private readonly params: GenderParams,
  ) {}

  /** Resolved from the npc id alone: partners from their household's one couple draw, everyone else from their own. */
  of(npcId: string): Gender {
    const adultIdx = parseAdultId(npcId);
    if (adultIdx !== undefined) {
      const { groupIdx, h, member } = this.demo.locateAdult(adultIdx);
      if (COUPLE_FORMS.has(this.demo.householdShape(groupIdx, h).form)) {
        return pickCoupleGender(this.seed, this.params, `${groupIdx}.${h}`, member);
      }
    }
    return pickGender(this.seed, this.params.femaleShare, npcId);
  }

  /** One draw against the sex ratio from a crowd agent's own stream, before it resolves to a person. */
  draw(r: Rand): Gender {
    return genderOf(r.next() < this.params.femaleShare);
  }
}

function genderOf(female: boolean): Gender {
  return female ? 'female' : 'male';
}
