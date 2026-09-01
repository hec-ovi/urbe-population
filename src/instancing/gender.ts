/**
 * Gender assignment. Singles, single parents, roommates and kids draw
 * individually against the sex ratio, keyed by npcId alone. A couple is one
 * household-level draw instead: the two partners get opposite genders unless
 * the household falls in `sameGenderCoupleShare`. Both paths key off stable
 * ids, so a family stub and its full instance agree whatever order people are
 * instantiated in.
 */

import { hash01 } from '../core/rng.js';
import type { Gender } from '../schemas/npc.js';

export interface GenderParams {
  femaleShare: number;
  sameGenderCoupleShare: number;
}

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

function genderOf(female: boolean): Gender {
  return female ? 'female' : 'male';
}
