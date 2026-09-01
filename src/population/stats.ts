/**
 * Aggregate statistics, computed once (lazily) by walking the same assignment
 * model instantiation uses, so aggregates and instances always agree.
 */

import type { Demographics } from './demographics.js';
import type { AssignmentModel } from './assignment.js';
import type { WorldModel } from '../world/model.js';
import type { DistrictPopulation, PopulationStats, TierPopulation } from '../schemas/population.js';

export function buildStats(world: WorldModel, demo: Demographics, assignment: AssignmentModel): PopulationStats {
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
    perDistrict: [...perDistrict.values()],
  };
}
