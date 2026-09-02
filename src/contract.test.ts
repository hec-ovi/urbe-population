/**
 * Contract tests: every promise in CONTRACT.md exercised through the public
 * entry point against the standalone fixture city. No internals are imported.
 */

import { describe, expect, it } from 'vitest';
import { createSimulation, restoreSimulation, DEFAULT_TYPE_SET, SimulationError } from './index.js';
import { FIXTURE_BLUEPRINT, FIXTURE_INTERIORS } from './fixtures/small-city.js';
import { FIXTURE_THEMED_TYPES } from './fixtures/themed-types.js';
import type { CitySimulation, NPCInstance, SimulationInput, SimulationParams } from './index.js';

const SEED = 'urbe-test-1';
const MON_9 = 9 * 60;
const MON_NOON = 12 * 60;
const MON_3AM = 3 * 60;

function makeInput(params?: SimulationParams): SimulationInput {
  return { seed: SEED, blueprint: FIXTURE_BLUEPRINT, interiors: FIXTURE_INTERIORS, ...(params ? { params } : {}) };
}

function make(): CitySimulation {
  return createSimulation(makeInput());
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof SimulationError ? e.code : `unexpected:${String(e)}`;
  }
}

describe('determinism', () => {
  it('same seed gives identical aggregate stats and crowds regardless of call order', () => {
    const a = make();
    const b = make();
    const aCrowdCity = a.crowd(MON_NOON, { kind: 'city' });
    const aStats = a.populationStats();
    const bStats = b.populationStats();
    const bCrowdEdge = b.crowd(MON_NOON, { kind: 'edge', id: 'e1' });
    const bCrowdCity = b.crowd(MON_NOON, { kind: 'city' });
    const aCrowdEdge = a.crowd(MON_NOON, { kind: 'edge', id: 'e1' });
    expect(JSON.stringify(aStats)).toBe(JSON.stringify(bStats));
    expect(JSON.stringify(aCrowdCity)).toBe(JSON.stringify(bCrowdCity));
    expect(JSON.stringify(aCrowdEdge)).toBe(JSON.stringify(bCrowdEdge));
  });

  it('different seeds give different populations', () => {
    const a = make().populationStats();
    const b = createSimulation({ ...makeInput(), seed: 'other-seed' }).populationStats();
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('same interaction order gives identical instanced NPCs', () => {
    const a = make();
    const b = make();
    const va = a.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
    const vb = b.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
    expect(JSON.stringify(va)).toBe(JSON.stringify(vb));
    const agentsA = a.crowd(MON_NOON, { kind: 'edge', id: 'e1' }).agents;
    const agentsB = b.crowd(MON_NOON, { kind: 'edge', id: 'e1' }).agents;
    expect(agentsA.length).toBeGreaterThan(0);
    const ia = a.instantiate({ crowdId: agentsA[0]!.crowdId, timeMin: MON_NOON });
    const ib = b.instantiate({ crowdId: agentsB[0]!.crowdId, timeMin: MON_NOON });
    expect(JSON.stringify(ia)).toBe(JSON.stringify(ib));
  });
});

describe('population statistics', () => {
  it('reports coherent totals per district and tier', () => {
    const stats = make().populationStats();
    expect(stats.population).toBeGreaterThan(0);
    expect(stats.households).toBeGreaterThan(0);
    expect(stats.employed).toBeGreaterThan(0);
    expect(stats.employed + stats.unemployed).toBeLessThanOrEqual(stats.population);
    const typeTotal = Object.values(stats.typeCounts).reduce((s, n) => s + n, 0);
    expect(typeTotal).toBe(stats.employed + stats.unemployed);
    let districtPop = 0;
    for (const d of stats.perDistrict) districtPop += d.population;
    expect(districtPop).toBe(stats.population);
  });

  it('calibrates residents to the blueprint population and publishes the factor', () => {
    const estimate = make().populationStats();
    expect(estimate.calibrationFactor).toBe(1);
    const target = Math.round(estimate.population * 2.5);
    const promised = { ...FIXTURE_BLUEPRINT, stats: { ...FIXTURE_BLUEPRINT.stats, population: target } };
    const stats = createSimulation({ ...makeInput(), blueprint: promised }).populationStats();
    expect(Math.abs(stats.population - target) / target).toBeLessThanOrEqual(0.03);
    expect(stats.calibrationFactor).toBeGreaterThan(1);
    expect(stats.perDistrict.reduce((s, d) => s + d.population, 0)).toBe(stats.population);
  });
});

describe('crowd layer', () => {
  it('street crowds are typed, capped, and thinner at night than at noon', () => {
    const sim = make();
    const noon = sim.crowd(MON_NOON, { kind: 'city' });
    const night = sim.crowd(MON_3AM, { kind: 'city' });
    const total = (g: typeof noon) => g.groups.reduce((s, x) => s + x.count, 0);
    expect(total(noon)).toBeGreaterThan(total(night));
    const edge = sim.crowd(MON_NOON, { kind: 'edge', id: 'e1' });
    expect(edge.agents.length).toBeGreaterThan(0);
    expect(edge.agents.length).toBeLessThanOrEqual(64);
    for (const agent of edge.agents) {
      expect(agent.crowdId).toContain('e1');
      expect(agent.type.length).toBeGreaterThan(0);
    }
  });

  it('a street with no sidewalk carries nobody and is no crowd scope', () => {
    const sim = make();
    expect(code(() => sim.crowd(MON_NOON, { kind: 'edge', id: 'e_deck' }))).toBe('E_UNKNOWN_ID');
    const near = sim.crowd(MON_NOON, { kind: 'radius', x: 1200, z: 50, metres: 40 });
    expect(near.agents).toHaveLength(0);
  });

  it('every blueprint district is on the surface, including industrial ones without residents', () => {
    const sim = make();
    const stats = sim.populationStats();
    expect(stats.perDistrict.map((d) => d.districtId).sort()).toEqual(['d0', 'd1', 'd2']);
    const industrial = stats.perDistrict.find((d) => d.districtId === 'd2')!;
    expect(industrial.population).toBe(0);
    const commute = sim.crowd(7 * 60 + 30, { kind: 'district', id: 'd2' });
    expect(commute.groups.reduce((s, g) => s + g.count, 0)).toBeGreaterThan(0);
  });

  it('maxAgents 0 is a count-only call returning no agents', () => {
    const sim = make();
    const slice = sim.crowd(MON_NOON, { kind: 'city' }, { maxAgents: 0 });
    expect(slice.agents).toEqual([]);
    expect(slice.groups.length).toBeGreaterThan(0);
  });

  it('every scope kind returns sampled instantiable agents capped by maxAgents', () => {
    const sim = make();
    const city = sim.crowd(MON_NOON, { kind: 'city' });
    expect(city.agents.length).toBeGreaterThan(0);
    expect(city.agents.length).toBeLessThanOrEqual(64);
    const district = sim.crowd(MON_NOON, { kind: 'district', id: 'd1' }, { maxAgents: 5 });
    expect(district.agents.length).toBeGreaterThan(0);
    expect(district.agents.length).toBeLessThanOrEqual(5);
    const walker = sim.instantiate({ crowdId: district.agents[0]!.crowdId, timeMin: MON_NOON });
    expect(walker.type).toBe(district.agents[0]!.type);

    const busy = createSimulation({ ...makeInput(), params: { streetDensity: 20 } });
    const stop = busy.crowd(8 * 60, { kind: 'stop', id: 'b1' });
    expect(stop.agents.length).toBeGreaterThan(0);
    expect(stop.agents[0]!.activity).toBe('transit_wait');

    const parcel = sim.crowd(MON_9, { kind: 'parcel', id: 'p_cafe' });
    expect(parcel.agents.length).toBeGreaterThan(0);
    const worker = sim.instantiate({ crowdId: parcel.agents[0]!.crowdId, timeMin: MON_9 });
    expect(worker.job!.parcelId).toBe('p_cafe');
    const again = sim.instantiate({ crowdId: parcel.agents[0]!.crowdId, timeMin: MON_9 });
    expect(again.npcId).toBe(worker.npcId);
  });

  it('a radius scope returns every person inside the circle, uncapped, with instantiable handles', () => {
    const busy = createSimulation({ ...makeInput(), params: { streetDensity: 20 } });
    const centre = { x: 750, z: 250 };
    const slice = busy.crowd(MON_NOON, { kind: 'radius', ...centre, metres: 120 });
    expect(slice.agents.length).toBeGreaterThan(64);
    expect(slice.agents.length).toBe(slice.groups.reduce((s, g) => s + g.count, 0));
    for (const agent of slice.agents) {
      const at = agent.place.kind === 'stop' ? stopPosition(agent.place.id) : alongEdge(agent.place.id, agent.progress);
      expect(Math.hypot(at[0] - centre.x, at[1] - centre.z)).toBeLessThanOrEqual(120);
    }
    const inner = busy.crowd(MON_NOON, { kind: 'radius', ...centre, metres: 30 });
    expect(inner.agents.length).toBeLessThan(slice.agents.length);
    const walker = busy.instantiate({ crowdId: slice.agents[0]!.crowdId, timeMin: MON_NOON });
    expect(walker.type).toBe(slice.agents[0]!.type);
    expect(code(() => busy.crowd(MON_NOON, { kind: 'radius', ...centre, metres: 0 }))).toBe('E_INVALID_INPUT');
  });

  it('a parcel scope reports on-duty workers', () => {
    const sim = make();
    const cafeDay = sim.crowd(MON_9, { kind: 'parcel', id: 'p_cafe' });
    expect(cafeDay.groups.reduce((s, g) => s + g.count, 0)).toBeGreaterThan(0);
    expect(cafeDay.agents[0]!.trip.startMin).toBeLessThanOrEqual(MON_9);
    expect(cafeDay.agents[0]!.trip.endMin).toBeGreaterThan(MON_9);
    const policeNight = sim.crowd(MON_3AM, { kind: 'parcel', id: 'p_police' });
    expect(policeNight.groups.reduce((s, g) => s + g.count, 0)).toBeGreaterThan(0);
  });
});

describe('street presence', () => {
  const outdoors = (sim: CitySimulation, hour: number, day = 0): number =>
    sim
      .crowd(day * 24 * 60 + hour * 60, { kind: 'city' }, { maxAgents: 0 })
      .groups.reduce((s, g) => s + g.count, 0);

  it('puts a researched share of the city outdoors, with rush peaks and an evening tail', () => {
    const sim = make();
    const pop = sim.populationStats().population;
    const share = (hour: number): number => outdoors(sim, hour) / pop;
    expect(share(17)).toBeGreaterThan(0.1);
    expect(share(17)).toBeLessThan(0.25);
    expect(share(8)).toBeGreaterThan(0.07);
    expect(share(13)).toBeGreaterThan(0.06);
    expect(share(21)).toBeGreaterThan(0.03);
    expect(share(3)).toBeLessThan(0.03);
    expect(outdoors(sim, 17)).toBeGreaterThan(outdoors(sim, 13));
    expect(outdoors(sim, 13)).toBeGreaterThan(outdoors(sim, 3) * 4);
  });

  it('flattens the rush at the weekend and holds the afternoon', () => {
    const sim = make();
    expect(outdoors(sim, 8, 5)).toBeLessThan(outdoors(sim, 8));
    expect(outdoors(sim, 14, 5)).toBeGreaterThan(outdoors(sim, 14) * 0.9);
  });

  it('streetDensity scales liveliness without changing the shape of the day', () => {
    const sim = make();
    const busy = createSimulation({ ...makeInput(), params: { streetDensity: 3 } });
    for (const hour of [9, 17, 21]) {
      const ratio = outdoors(busy, hour) / outdoors(sim, hour);
      expect(ratio).toBeGreaterThan(2.5);
      expect(ratio).toBeLessThan(3.5);
    }
    const twin = createSimulation({ ...makeInput(), params: { streetDensity: 3 } });
    expect(JSON.stringify(twin.crowd(MON_NOON, { kind: 'city' }))).toBe(JSON.stringify(busy.crowd(MON_NOON, { kind: 'city' })));
  });

  it('draws people to the streets the land use pulls them to', () => {
    const sim = make();
    const on = (id: string): number =>
      sim.crowd(MON_NOON, { kind: 'edge', id }, { maxAgents: 0 }).groups.reduce((s, g) => s + g.count, 0);
    // e1 and e5 are both 500 m of pavement in d1; only e1 has doors on it.
    expect(on('e1')).toBeGreaterThan(on('e5'));
  });
});

describe('lazy instantiation', () => {
  it('a crowd agent becomes a full persistent NPC of the same type', () => {
    const sim = make();
    const agents = sim.crowd(MON_NOON, { kind: 'edge', id: 'e1' }).agents;
    const agent = agents[0]!;
    const inst = sim.instantiate({ crowdId: agent.crowdId, timeMin: MON_NOON });
    expect(inst.type).toBe(agent.type);
    expect(inst.name.given.length).toBeGreaterThan(0);
    expect(inst.home.parcelId.startsWith('p_r')).toBe(true);
    const again = sim.instantiate({ crowdId: agent.crowdId, timeMin: MON_NOON });
    expect(again.npcId).toBe(inst.npcId);
    expect(sim.getNPC(inst.npcId)).toBe(inst);
  });

  it('a handle names one trip and resolves at every minute of it (read at 780, used at 782)', () => {
    const sim = make();
    const held = sim.crowd(780, { kind: 'edge', id: 'e1' }).agents.filter((a) => a.trip.endMin >= 782);
    expect(held.length).toBeGreaterThan(0);
    expect(sim.instantiate({ crowdId: held[0]!.crowdId, timeMin: 782 }).type).toBe(held[0]!.type);

    const walker = sim.crowd(MON_NOON, { kind: 'edge', id: 'e1' }).agents[0]!;
    expect(walker.trip.startMin).toBeLessThanOrEqual(MON_NOON);
    expect(walker.trip.endMin).toBeGreaterThanOrEqual(MON_NOON);
    let along = -1;
    for (let t = walker.trip.startMin; t <= walker.trip.endMin; t++) {
      const same = sim.crowd(t, { kind: 'edge', id: 'e1' }).agents.find((a) => a.crowdId === walker.crowdId)!;
      expect(same.trip).toEqual(walker.trip);
      const here = walker.direction === 1 ? same.progress : 1 - same.progress;
      expect(here).toBeGreaterThan(along);
      along = here;
    }
    const first = sim.instantiate({ crowdId: walker.crowdId, timeMin: walker.trip.startMin });
    expect(sim.instantiate({ crowdId: walker.crowdId, timeMin: walker.trip.endMin }).npcId).toBe(first.npcId);

    const busy = createSimulation({ ...makeInput(), params: { streetDensity: 20 } });
    const wait = busy.crowd(8 * 60, { kind: 'stop', id: 'b1' }).agents[0]!;
    expect(wait.trip.endMin - wait.trip.startMin + 1).toBe(8);
    const still = busy.crowd(wait.trip.endMin, { kind: 'stop', id: 'b1' }).agents.find((a) => a.crowdId === wait.crowdId);
    expect(still).toBeDefined();
    expect(busy.instantiate({ crowdId: wait.crowdId, timeMin: wait.trip.endMin }).type).toBe(wait.type);
  });

  it('the last minute a trip states is a minute it is alive, on the shortest edge trip there is', () => {
    const sim = make();
    const shortest = sim
      .crowd(780, { kind: 'city' }, { maxAgents: 64 })
      .agents.filter((a) => a.place.kind === 'edge')
      .sort((a, b) => a.trip.endMin - a.trip.startMin - (b.trip.endMin - b.trip.startMin))[0]!;
    const { startMin, endMin } = shortest.trip;
    const scope = { kind: 'edge', id: shortest.place.id } as const;
    const listed = sim.crowd(endMin, scope).agents.find((a) => a.crowdId === shortest.crowdId);
    expect(listed?.trip).toEqual(shortest.trip);
    expect(sim.instantiate({ crowdId: shortest.crowdId, timeMin: endMin }).type).toBe(shortest.type);
    expect(sim.crowd(endMin + 1, scope).agents.some((a) => a.crowdId === shortest.crowdId)).toBe(false);
    expect(endMin - startMin + 1).toBeGreaterThanOrEqual(2);
  });

  it('every body in a slice instantiates into a person of its type and gender, rare types included', () => {
    const sim = make();
    const bodies = [
      ...sim.crowd(780, { kind: 'edge', id: 'e1' }).agents,
      ...sim.crowd(MON_NOON, { kind: 'city' }, { maxAgents: 24 }).agents,
    ];
    const types = new Set<string>();
    for (const body of bodies) {
      const person = sim.instantiate({ crowdId: body.crowdId, timeMin: body.trip.startMin });
      expect([person.type, person.gender]).toEqual([body.type, body.gender]);
      types.add(body.type);
    }
    expect(types.size).toBeGreaterThan(3);
  });

  it('after its trip a handle is stale unless it was instantiated, which binds it for good', () => {
    const sim = make();
    const agents = sim.crowd(MON_NOON, { kind: 'edge', id: 'e1' }).agents;
    const walker = agents[0]!;
    const other = agents[1]!;
    const person = sim.instantiate({ crowdId: walker.crowdId, timeMin: MON_NOON });
    expect(sim.crowd(walker.trip.endMin + 1, { kind: 'edge', id: 'e1' }).agents.some((a) => a.crowdId === walker.crowdId)).toBe(false);
    expect(sim.instantiate({ crowdId: walker.crowdId, timeMin: walker.trip.endMin + 1440 }).npcId).toBe(person.npcId);
    expect(code(() => sim.instantiate({ crowdId: other.crowdId, timeMin: other.trip.endMin + 1 }))).toBe('E_STALE_HANDLE');
  });

  it('routines cover the whole week with no gaps and repeat weekly', () => {
    const sim = make();
    const inst = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
    for (let day = 0; day < 7; day++) {
      const spans = inst.routine
        .filter((e) => e.days.includes(day))
        .map((e) => [e.startMin, e.endMin] as const)
        .sort((a, b) => a[0] - b[0]);
      expect(spans.length).toBeGreaterThan(0);
      expect(spans[0]![0]).toBe(0);
      let cursor = 0;
      for (const [s, e] of spans) {
        expect(s).toBe(cursor);
        expect(e).toBeGreaterThan(s);
        cursor = e;
      }
      expect(cursor).toBe(1440);
    }
  });

  it('family members are stubs instantiable to full NPCs in the same home', () => {
    const sim = make();
    let withFamily: NPCInstance | undefined;
    for (let i = 0; i < 40 && !withFamily; i++) {
      const inst = sim.instantiate({ npcId: `a${i}` });
      if (inst.family.length > 0) withFamily = inst;
    }
    expect(withFamily).toBeDefined();
    const stub = withFamily!.family[0]!;
    expect(stub.instantiated).toBe(false);
    const member = sim.instantiate({ npcId: stub.npcId });
    expect(member.home.parcelId).toBe(withFamily!.home.parcelId);
    expect(member.home.unit).toBe(withFamily!.home.unit);
    expect(member.name.family).toBe(stub.name.family);
  });
});

/** Fixture streets are straight segments, so a walker's position is linear in progress. */
function alongEdge(edgeId: string, progress: number): [number, number] {
  const path = FIXTURE_BLUEPRINT.streets.edges.find((e) => e.id === edgeId)!.path;
  const [a, b] = [path[0]!, path[path.length - 1]!];
  return [a[0] + (b[0] - a[0]) * progress, a[1] + (b[1] - a[1]) * progress];
}

function stopPosition(stopId: string): [number, number] {
  return FIXTURE_BLUEPRINT.transit.busStops.find((s) => s.id === stopId)!.position;
}

/** Instances taken in a fixed order, enough of them to see both genders. */
function sample(sim: CitySimulation, n = 40): NPCInstance[] {
  const out: NPCInstance[] = [];
  for (let i = 0; i < n; i++) out.push(sim.instantiate({ npcId: `a${i}` }));
  return out;
}

describe('gender', () => {
  it('gives every NPC a gender and draws the given name from that gender bucket', () => {
    const buckets = DEFAULT_TYPE_SET.namePool.givenByGender!;
    const genders = new Set<string>();
    for (const npc of sample(make())) {
      genders.add(npc.gender);
      expect(buckets[npc.gender]).toContain(npc.name.given);
    }
    expect(genders).toEqual(new Set(['male', 'female']));
  });

  it('draws from the whole pool when the pool carries no gender buckets', () => {
    const namePool = { given: ['Wren', 'Sasha', 'Noor', 'Kit'], family: ['Vale', 'Orsi'] };
    const genders = new Set<string>();
    for (const npc of sample(createSimulation({ ...makeInput(), namePool }))) {
      genders.add(npc.gender);
      expect(namePool.given).toContain(npc.name.given);
    }
    expect(genders).toEqual(new Set(['male', 'female']));
  });

  it('holds gender fixed per NPC across sims and through a save', () => {
    const a = make();
    const b = make();
    expect(sample(a).map((n) => n.gender)).toEqual(sample(b).map((n) => n.gender));
    const vendor = a.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
    const restored = restoreSimulation(makeInput(), a.serialize());
    expect(restored.getNPC(vendor.npcId).gender).toBe(vendor.gender);
  });

  it('crowd agents carry the gender their handle resolves to', () => {
    const sim = make();
    const agents = [
      ...sim.crowd(MON_NOON, { kind: 'city' }, { maxAgents: 12 }).agents,
      ...sim.crowd(MON_9, { kind: 'parcel', id: 'p_corpo' }, { maxAgents: 12 }).agents,
    ];
    const seen = new Set<string>();
    for (const agent of agents) {
      seen.add(agent.gender);
      const timeMin = agent.place.kind === 'parcel' ? MON_9 : MON_NOON;
      expect(sim.instantiate({ crowdId: agent.crowdId, timeMin }).gender).toBe(agent.gender);
    }
    expect(seen).toEqual(new Set(['male', 'female']));
  });

  it('params.femaleShare steers the mix', () => {
    const sim = createSimulation({ ...makeInput(), params: { femaleShare: 1 } });
    expect(sample(sim, 10).every((n) => n.gender === 'female')).toBe(true);
  });

  it("holds a couple's genders whichever partner is instantiated first", () => {
    const [one, two] = firstCouple(make());
    const reverse = make();
    expect(reverse.instantiate({ npcId: two.npcId }).gender).toBe(two.gender);
    expect(reverse.instantiate({ npcId: one.npcId }).gender).toBe(one.gender);
  });

  it('draws a couple once per household, so same-gender couples track the parameter', () => {
    const mix = coupleMix(crowdedInput());
    expect(mix.couples).toBeGreaterThan(1500);
    expect(mix.sameShare).toBeGreaterThan(0.015);
    expect(mix.sameShare).toBeLessThan(0.05);
    expect(mix.femaleShare).toBeGreaterThan(0.49);
    expect(mix.femaleShare).toBeLessThan(0.52);
  });

  it('params.sameGenderCoupleShare steers the couple mix', () => {
    expect(coupleMix(makeInput({ sameGenderCoupleShare: 0 })).sameShare).toBe(0);
    expect(coupleMix(makeInput({ sameGenderCoupleShare: 1 })).sameShare).toBe(1);
  });
});

/** The first couple in the city, both partners instanced. */
function firstCouple(sim: CitySimulation): [NPCInstance, NPCInstance] {
  for (let i = 0; i < 200; i++) {
    const npc = sim.instantiate({ npcId: `a${i}` });
    const partner = npc.family.find((f) => f.relation === 'partner');
    if (partner) return [npc, sim.instantiate({ npcId: partner.npcId })];
  }
  throw new Error('no couple in the fixture city');
}

/** The fixture city with a tower block added: enough couples to measure a rate. */
function crowdedInput(params?: SimulationParams): SimulationInput {
  const home = FIXTURE_BLUEPRINT.parcels.find((p) => p.type === 'residential')!;
  const tower = { ...home, id: 'p_tower', envelope: { ...home.envelope, minFloors: 600, maxFloors: 600 } };
  const blueprint = { ...FIXTURE_BLUEPRINT, parcels: [...FIXTURE_BLUEPRINT.parcels, tower] };
  return { ...makeInput(params), blueprint };
}

/** Walks every adult: the share of couples sharing a gender, and the female share. */
function coupleMix(input: SimulationInput): { couples: number; sameShare: number; femaleShare: number } {
  const sim = createSimulation(input);
  const partnered = new Set<string>();
  let couples = 0;
  let same = 0;
  let female = 0;
  let adults = 0;
  for (let i = 0; i < sim.populationStats().population; i++) {
    let npc: NPCInstance;
    try {
      npc = sim.instantiate({ npcId: `a${i}` });
    } catch {
      break; // past the last adult id
    }
    adults++;
    if (npc.gender === 'female') female++;
    const partner = npc.family.find((f) => f.relation === 'partner');
    if (!partner || partnered.has(npc.npcId)) continue;
    partnered.add(partner.npcId);
    couples++;
    if (sim.instantiate({ npcId: partner.npcId }).gender === npc.gender) same++;
  }
  return { couples, sameShare: same / couples, femaleShare: female / adults };
}

/** One workplace of every staffed kind, with hours inside and outside its rota. */
const VENUES: { id: string; open: number[]; closed: number[] }[] = [
  { id: 'p_cafe', open: [7, 12, 17], closed: [3, 20] },
  { id: 'p_shop', open: [9, 13, 18], closed: [3, 21] },
  { id: 'p_mall', open: [11, 16, 20], closed: [3, 23] },
  { id: 'p_rest', open: [20], closed: [9] },
  { id: 'p_office', open: [9, 13, 16], closed: [3, 21] },
  { id: 'p_corpo', open: [8, 12, 15], closed: [3, 22] },
  { id: 'p_clinic', open: [9, 14, 17], closed: [3, 21] },
  { id: 'p_factory', open: [7, 13, 20], closed: [3, 23] },
  { id: 'p_hotel', open: [3, 9, 15, 21], closed: [] },
  { id: 'p_hospital', open: [3, 9, 15, 21], closed: [] },
  { id: 'p_police', open: [3, 9, 15, 21], closed: [] },
  { id: 'p_base', open: [3, 9, 15, 21], closed: [] },
];

describe('vendor queries and staffing', () => {
  it('staffs every venue kind through its opening hours and empties it when closed', () => {
    const sim = make();
    for (const venue of VENUES) {
      for (const hour of venue.open) {
        const t = hour * 60;
        const onDuty = sim.crowd(t, { kind: 'parcel', id: venue.id }, { maxAgents: 128 });
        expect(onDuty.agents.length).toBeGreaterThan(0);
        expect(onDuty.agents.length).toBe(onDuty.groups.reduce((s, g) => s + g.count, 0));
        const vendor = sim.getNPCVendor({ parcelId: venue.id, timeMin: t });
        expect(vendor.job!.parcelId).toBe(venue.id);
      }
      for (const hour of venue.closed) {
        const t = hour * 60;
        expect(sim.crowd(t, { kind: 'parcel', id: venue.id }).agents).toEqual([]);
        expect(code(() => sim.getNPCVendor({ parcelId: venue.id, timeMin: t }))).toBe('E_NO_MATCH');
      }
    }
  });

  it('keeps the on-duty headcount steady across shifts and over the weekend', () => {
    const sim = make();
    const at = (id: string, timeMin: number): number => sim.crowd(timeMin, { kind: 'parcel', id }, { maxAgents: 128 }).agents.length;
    const SAT = 5 * 24 * 60;
    const SUN = 6 * 24 * 60;
    for (const id of ['p_cafe', 'p_shop', 'p_hotel', 'p_police']) {
      const monday = at(id, MON_NOON);
      expect(at(id, SAT + MON_NOON)).toBe(monday);
      expect(at(id, SUN + MON_NOON)).toBe(monday);
    }
    // The cafe's rota is the interior's declared barista count, morning and afternoon alike.
    expect(at('p_cafe', 7 * 60)).toBe(at('p_cafe', 17 * 60));
    expect(at('p_cafe', MON_NOON)).toBeGreaterThanOrEqual(1);
    expect(at('p_cafe', MON_NOON)).toBeLessThanOrEqual(2);
    const roles = sim
      .crowd(MON_9, { kind: 'parcel', id: 'p_cafe' })
      .agents.map((a) => sim.instantiate({ crowdId: a.crowdId, timeMin: MON_9 }).job!.role);
    expect(roles.every((r) => r === 'barista')).toBe(true);
    // Weekday-only kinds stay shut at the weekend.
    expect(at('p_office', SAT + MON_NOON)).toBe(0);
    // No job slot is handed to two people: a full shift is that many distinct NPCs.
    const shift = sim.crowd(MON_9, { kind: 'parcel', id: 'p_corpo' }, { maxAgents: 128 }).agents;
    const staff = new Set(shift.map((a) => sim.instantiate({ crowdId: a.crowdId, timeMin: MON_9 }).npcId));
    expect(staff.size).toBe(shift.length);
  });

  it('staffs the opening shift of every venue first when jobs outnumber workers', () => {
    const thin = createSimulation({ ...makeInput(), params: { occupancyRate: 0.05 } });
    expect(thin.populationStats().employed).toBeLessThan(50);
    for (const id of ['p_cafe', 'p_shop', 'p_police']) {
      expect(thin.crowd(MON_9, { kind: 'parcel', id }).agents.length).toBeGreaterThan(0);
      expect(thin.getNPCVendor({ parcelId: id, timeMin: MON_9 }).job!.parcelId).toBe(id);
    }
  });

  it('finds the on-duty barista at the cafe, on shift, with an interior role', () => {
    const sim = make();
    const vendor = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
    expect(vendor.job).toBeDefined();
    expect(vendor.job!.parcelId).toBe('p_cafe');
    expect(vendor.job!.role).toBe('barista');
    const repeat = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
    expect(repeat.npcId).toBe(vendor.npcId);
  });

  it('type follows the parcel, job.role follows the interior, even when the two disagree', () => {
    const generic = {
      ...FIXTURE_INTERIORS.p_cafe!,
      roles: [{ id: 'r_rec', role: 'receptionist' as const, floor: 0, homeAnchor: 'a_counter', count: [1, 1] as [number, number] }],
      routines: [],
    };
    const sim = createSimulation({ ...makeInput(), interiors: { ...FIXTURE_INTERIORS, p_cafe: generic } });
    const vendor = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
    expect(vendor.type).toBe('barista');
    expect(vendor.job!.role).toBe('receptionist');
    expect(sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9, role: 'receptionist' }).npcId).toBe(vendor.npcId);
    expect(code(() => sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9, role: 'barista' }))).toBe('E_NO_MATCH');
  });

  /** The categories the contract says may hold each post, best first. */
  const ADMITS: Record<string, string[]> = {
    barista: ['vendor', 'worker'],
    waiter: ['vendor', 'worker'],
    cook: ['vendor', 'worker'],
    vendor: ['vendor'],
    receptionist: ['vendor', 'worker'],
    security: ['authority', 'worker'],
    officer: ['authority'],
    guard: ['authority', 'worker'],
    office_worker: ['worker'],
    medic: ['worker'],
    operator: ['worker'],
    cleaner: ['worker'],
  };

  it('every worker on duty holds a post their type category admits, on the themed vocabulary', () => {
    const sim = createSimulation({ ...makeInput(), npcTypes: FIXTURE_THEMED_TYPES });
    const category = new Map(FIXTURE_THEMED_TYPES.types.map((t) => [t.type, t.category]));
    const pairs: string[] = [];
    for (const parcel of FIXTURE_BLUEPRINT.parcels) {
      for (const t of [MON_9, MON_NOON, 20 * 60, MON_3AM]) {
        for (const agent of sim.crowd(t, { kind: 'parcel', id: parcel.id }).agents) {
          const person = sim.instantiate({ crowdId: agent.crowdId, timeMin: t });
          const role = person.job!.role;
          pairs.push(`${parcel.type}/${role}/${person.type}`);
          expect(ADMITS[role]).toBeDefined();
          expect([role, category.get(person.type)]).toEqual([role, expect.stringMatching(new RegExp(`^(${ADMITS[role]!.join('|')})$`))]);
        }
      }
    }
    expect(new Set(pairs).size).toBeGreaterThan(10);
    expect(sim.populationStats().typeGaps).toEqual([]);
  });

  it('a typed set with no category for a post says so and still staffs it', () => {
    const holed = {
      ...FIXTURE_THEMED_TYPES,
      types: FIXTURE_THEMED_TYPES.types.filter((t) => t.category !== 'vendor' && t.category !== 'authority'),
    };
    const sim = createSimulation({ ...makeInput(), npcTypes: holed });
    expect(sim.populationStats().typeGaps).toEqual([
      { role: 'officer', categories: ['authority'], parcelTypes: ['police'] },
      { role: 'vendor', categories: ['vendor'], parcelTypes: ['commerce', 'mall'] },
    ]);
    expect(sim.getNPCVendor({ parcelId: 'p_shop', timeMin: MON_NOON }).job!.role).toBe('vendor');
  });

  it('the 24/7 police station has night coverage', () => {
    const sim = make();
    const nightShift = sim.getNPCVendor({ parcelId: 'p_police', timeMin: MON_3AM });
    expect(nightShift.job).toBeDefined();
    expect(nightShift.job!.shift.kind).toBe('night');
  });

  it('night workers commute and sleep on inverted schedules', () => {
    const sim = make();
    const nightShift = sim.getNPCVendor({ parcelId: 'p_police', timeMin: MON_3AM });
    const morningSleep = nightShift.routine.some(
      (e) => e.activity === 'sleeping' && e.startMin < 12 * 60 && e.endMin > 8 * 60,
    );
    expect(morningSleep).toBe(true);
  });

  it('cross-district commuters ride the bus with a concrete route and stops', () => {
    const sim = make();
    const workers = [
      sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 }),
      sim.getNPCVendor({ parcelId: 'p_office', timeMin: MON_9 }),
      sim.getNPCVendor({ parcelId: 'p_shop', timeMin: MON_NOON }),
    ];
    const legs = workers.flatMap((w) => w.routine.filter((e) => e.transitLeg));
    expect(legs.length).toBeGreaterThan(0);
    for (const leg of legs) {
      expect(leg.transitLeg!.routeId).toBe('r0');
      expect(['b0', 'b1', 'b2']).toContain(leg.transitLeg!.boardStopId);
    }
  });
});

describe('behavior state machine', () => {
  it('projects interior anchor steps for the working barista', () => {
    const sim = make();
    const vendor = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
    const onDuty = vendor.routine.find((e) => e.activity === 'working' && e.days.includes(0))!;
    const t = onDuty.startMin + 30;
    const state = sim.behaviorAt(vendor.npcId, t);
    expect(state.mode).toBe('interior');
    expect(state.interior).toBeDefined();
    if (state.interior && 'at' in state.interior) {
      expect(['a_counter', 'a_machine']).toContain(state.interior.at.anchorId);
      expect(state.interior.at.untilMin).toBeGreaterThan(t);
    }
  });

  it('is interruptible and resumable', () => {
    const sim = make();
    const vendor = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
    sim.interrupt(vendor.npcId, MON_9);
    expect(sim.behaviorAt(vendor.npcId, MON_9).interrupted).toBe(true);
    sim.resume(vendor.npcId, MON_9 + 5);
    expect(sim.behaviorAt(vendor.npcId, MON_9 + 5).interrupted).toBe(false);
  });

  it('sends day workers home to sleep at night', () => {
    const sim = make();
    const vendor = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
    if (vendor.job!.shift.kind === 'day') {
      const state = sim.behaviorAt(vendor.npcId, MON_3AM);
      expect(state.mode).toBe('home');
    }
  });
});

describe('flags', () => {
  it('dead NPCs stop matching vendor queries and reject further operations', () => {
    const sim = make();
    const vendor = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
    sim.applyFlag(vendor.npcId, { kind: 'die' });
    expect(code(() => sim.applyFlag(vendor.npcId, { kind: 'die' }))).toBe('E_DEAD');
    expect(code(() => sim.behaviorAt(vendor.npcId, MON_9))).toBe('E_DEAD');
    const replacementOrNone = code(() => {
      const next = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
      expect(next.npcId).not.toBe(vendor.npcId);
    });
    expect([undefined, 'E_NO_MATCH']).toContain(replacementOrNone);
    expect(sim.findNPCs({ type: vendor.type })).not.toContainEqual(expect.objectContaining({ npcId: vendor.npcId }));
  });

  it('resign clears the job; promote installs an executive at the target parcel', () => {
    const sim = make();
    const a = sim.getNPCVendor({ parcelId: 'p_office', timeMin: MON_9 });
    sim.applyFlag(a.npcId, { kind: 'resign' });
    expect(sim.getNPC(a.npcId).job).toBeUndefined();
    sim.applyFlag(a.npcId, { kind: 'promote', toParcelId: 'p_office' });
    expect(sim.getNPC(a.npcId).job!.role).toBe('executive');
    sim.applyFlag(a.npcId, { kind: 'custom', tag: 'quest:informant' });
    expect(sim.findNPCs({ flag: 'quest:informant' })[0]!.npcId).toBe(a.npcId);
  });
});

describe('reservations', () => {
  it('reserves a pre-instanced NPC with a fixed name and real statistical slot', () => {
    const sim = make();
    const reserved = sim.reserveNPC({ name: { given: 'Vesna', family: 'Ilic' }, gender: 'female', type: 'resident_low' });
    expect(reserved.name).toEqual({ given: 'Vesna', family: 'Ilic' });
    expect(reserved.gender).toBe('female');
    expect(reserved.type).toBe('resident_low');
    expect(sim.getNPC(reserved.npcId).name.given).toBe('Vesna');
  });

  it('rejects impossible reservations', () => {
    const sim = make();
    expect(code(() => sim.reserveNPC({ name: { given: 'X', family: 'Y' }, type: 'no_such_type' }))).toBe('E_NO_MATCH');
  });
});

describe('persistence', () => {
  it('serialize and restore reproduce the exact discovered state', () => {
    const sim = make();
    const vendor = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
    const agent = sim.crowd(MON_NOON, { kind: 'edge', id: 'e1' }).agents[0]!;
    const walker = sim.instantiate({ crowdId: agent.crowdId, timeMin: MON_NOON });
    sim.applyFlag(walker.npcId, { kind: 'die' });
    sim.interrupt(vendor.npcId, MON_9);
    const save = sim.serialize();

    const restored = restoreSimulation(makeInput(), save);
    expect(JSON.stringify(restored.getNPC(vendor.npcId))).toBe(JSON.stringify(sim.getNPC(vendor.npcId)));
    expect(restored.getNPC(walker.npcId).flags.dead).toBe(true);
    expect(restored.behaviorAt(vendor.npcId, MON_9).interrupted).toBe(true);
  });

  it('refuses a save from a different seed', () => {
    const sim = make();
    const save = sim.serialize();
    expect(code(() => restoreSimulation({ ...makeInput(), seed: 'other' }, save))).toBe('E_INVALID_INPUT');
  });
});

describe('errors', () => {
  it('closed error set covers bad input, unknown ids and bad times', () => {
    expect(code(() => createSimulation({ seed: 's', blueprint: { ...FIXTURE_BLUEPRINT, districts: [] } }))).toBe('E_INVALID_INPUT');
    const sim = make();
    expect(code(() => sim.getNPC('a999999'))).toBe('E_UNKNOWN_ID');
    expect(code(() => sim.instantiate({ npcId: 'a99999999' }))).toBe('E_UNKNOWN_ID');
    expect(code(() => sim.crowd(MON_NOON, { kind: 'district', id: 'nope' }))).toBe('E_UNKNOWN_ID');
    expect(code(() => sim.crowd(-5, { kind: 'city' }))).toBe('E_TIME');
    expect(code(() => sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: -1 }))).toBe('E_TIME');
  });
});
