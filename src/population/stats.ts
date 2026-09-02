/**
 * Aggregate statistics, computed once (lazily) by walking the same assignment
 * model instantiation uses, so aggregates and instances always agree.
 */

import { categoriesForRole } from './role-types.js';
import type { Demographics } from './demographics.js';
import type { AssignmentModel } from './assignment.js';
import type { WorldModel } from '../world/model.js';
import type { DistrictPopulation, PopulationStats, TierPopulation, TypeGap } from '../schemas/population.js';

/**
 * Roles the typed set cannot fill from an admitting category, with the parcel
 * types where they are staffed: the set has a hole and its workers take a type
 * from outside their role's categories.
 */
function typeGaps(world: WorldModel, assignment: AssignmentModel): TypeGap[] {
  const gaps = new Map<string, TypeGap>();
  for (const workplace of world.workplaces) {
    if (workplace.staffing.slotCount === 0) continue;
    for (const role of assignment.rolesOfWorkplace(workplace)) {
      if (assignment.admitsRole(role)) continue;
      const gap = gaps.get(role) ?? { role, categories: categoriesForRole(role), parcelTypes: [] };
      if (!gap.parcelTypes.includes(workplace.type)) gap.parcelTypes.push(workplace.type);
      gaps.set(role, gap);
    }
  }
  for (const gap of gaps.values()) gap.parcelTypes.sort();
  return [...gaps.values()].sort((a, b) => a.role.localeCompare(b.role));
}

export function buildStats(
  world: WorldModel,
  demo: Demographics,
  assignment: AssignmentModel,
  calibrationFactor: number,
): PopulationStats {
  const perDistrict = new Map<string, DistrictPopulation>();
  const cityTypes: Record<string, number> = {};
  let employed = 0;

  // Every blueprint district is present, including ones with zero residents
  // (industrial districts still carry a working population).
  for (const district of world.districts) {
    perDistrict.set(district.id, { districtId: district.id, population: 0, households: 0, byTier: {} });
  }

  for (const group of world.groups) {
    const d = perDistrict.get(group.districtId)!;
    const adults = demo.groupAdults(group.index);
    const kids = demo.groupKids(group.index);
    const tier: TierPopulation = {
      population: adults + kids,
      households: demo.households(group.index),
      employed: 0,
      unemployed: 0,
      typeCounts: {},
    };
    for (let a = 0; a < adults; a++) {
      const adultIdx = demo.adultIndexOf(group.index, 0, 0) + a;
      const type = assignment.typeOfAdult(adultIdx);
      tier.typeCounts[type.type] = (tier.typeCounts[type.type] ?? 0) + 1;
      cityTypes[type.type] = (cityTypes[type.type] ?? 0) + 1;
      if (assignment.isEmployed(adultIdx)) tier.employed++;
    }
    tier.unemployed = adults - tier.employed;
    employed += tier.employed;
    d.byTier[group.tier] = tier;
    d.population += tier.population;
    d.households += tier.households;
  }

  return {
    population: demo.totalPopulation,
    households: demo.totalHouseholds,
    employed,
    unemployed: demo.totalAdults - employed,
    typeCounts: cityTypes,
    calibrationFactor,
    typeGaps: typeGaps(world, assignment),
    perDistrict: [...perDistrict.values()],
  };
}
