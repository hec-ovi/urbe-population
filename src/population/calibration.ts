/**
 * Housing calibration: the blueprint's stats.population is the world's truth,
 * so the housing stock estimate is scaled until the residents it yields agree
 * with it within CALIBRATION_TOLERANCE. Residents are a monotone step
 * function of the factor, so a bracket found by doubling from 1 and a
 * bisection inside it land on the closest achievable count.
 */

import type { HousingStock } from './housing.js';
import type { HouseholdLedger } from './household.js';

const CALIBRATION_TOLERANCE = 0.03;
const FACTOR_MIN = 1 / 64;
const FACTOR_MAX = 64;
const BISECTIONS = 32;

/** Factor to apply to the housing stock; 1 when there is no target or the estimate already agrees. */
export function calibrateHousing(housing: HousingStock, ledger: HouseholdLedger, occupancyRate: number, target: number): number {
  if (!(target > 0)) return 1;
  const residents = (factor: number): number =>
    housing.groups(factor).reduce((sum, g) => {
      const households = Math.floor(g.totalUnits * occupancyRate);
      return sum + ledger.adultsBefore(g.index, households) + ledger.kidsBefore(g.index, households);
    }, 0);
  const miss = (factor: number): number => Math.abs(residents(factor) - target);
  if (miss(1) <= CALIBRATION_TOLERANCE * target) return 1;

  let lo = 1;
  let hi = 1;
  if (residents(1) < target) {
    while (residents(hi) < target && hi < FACTOR_MAX) hi *= 2;
  } else {
    while (residents(lo) >= target && lo > FACTOR_MIN) lo /= 2;
  }
  for (let i = 0; i < BISECTIONS; i++) {
    const mid = (lo + hi) / 2;
    if (residents(mid) >= target) hi = mid;
    else lo = mid;
  }
  return miss(lo) < miss(hi) ? lo : hi;
}
