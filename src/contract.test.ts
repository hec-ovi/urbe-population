import { describe, expect, it } from 'vitest';
import {
  CitySimulation, createSimulation, restoreSimulation, SimulationError,
  DEFAULT_TYPE_SET, FIXTURE_BLUEPRINT, FIXTURE_INTERIORS, FIXTURE_THEMED_TYPES,
  type CrowdSlice, type Networks, type NPCInstance, type SimulationInput,
} from './index.js';

const TIME = 540;
const input = (overrides: Partial<SimulationInput> = {}): SimulationInput => ({
  seed: 'urbe-test-1', blueprint: FIXTURE_BLUEPRINT, interiors: FIXTURE_INTERIORS, ...overrides,
});
const make = (overrides: Partial<SimulationInput> = {}): CitySimulation => createSimulation(input(overrides));
const vendor = (sim: CitySimulation): NPCInstance => sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: TIME });
const total = (slice: CrowdSlice): number => slice.groups.reduce((sum, group) => sum + group.count, 0);

function routedInput(): SimulationInput {
  const hub = { id: 'hub', x: 500, y: 3, z: 250, kind: 'corner' as const };
  const nodes: Networks['walk']['nodes'] = [hub];
  const edges: Networks['walk']['edges'] = [];
  for (const parcel of FIXTURE_BLUEPRINT.parcels) {
    const id = `entry-${parcel.id}`;
    const [x, z] = parcel.access.point;
    nodes.push({ id, x, y: 1, z, kind: 'entry', ref: parcel.id });
    edges.push({
      id: `walk-${parcel.id}`, from: id, to: hub.id, kind: 'access', width: 2,
      path: [[x, z], [hub.x, hub.z]],
      path3: [[x, 1, z], [hub.x, hub.y, hub.z]],
    });
  }
  return input({
    blueprint: { ...FIXTURE_BLUEPRINT, transit: {
      busStops: [], busRoutes: [], trainStations: [], trainLines: [], subwayStations: [], subwayLines: [],
    } },
    networks: { walk: { nodes, edges }, transit: { routes: [] } },
  });
}

function errorCode(run: () => unknown): string | undefined {
  try { run(); } catch (error) {
    expect(error).toBeInstanceOf(SimulationError);
    return (error as SimulationError).code;
  }
  return undefined;
}

describe('prepared inputs and statistics', () => {
  it('defaults and explicit parameters produce the same standalone population', () => {
    const base = { seed: 42, blueprint: FIXTURE_BLUEPRINT };
    const sim = new CitySimulation(base);
    const explicit = createSimulation({ ...base, npcTypes: DEFAULT_TYPE_SET, params: {
      occupancyRate: 0.55, unemploymentRate: 0.041, femaleShare: 0.51, sameGenderCoupleShare: 0.03,
      householdMix: { single: 0.29, couple: 0.27, coupleKids: 0.21, singleParent: 0.1, shared: 0.13 },
      shiftMix: { day: 0.84, evening: 0.06, night: 0.04, rotating: 0.06 },
      streetDensity: 1, defaultHeadwayMin: 12,
    } });
    expect(sim.populationStats()).toEqual(explicit.populationStats());
    expect(vendor(sim).job?.parcelId).toBe('p_cafe');
  });

  it('counts districts, tiers and adult types consistently, including districts with no residents', () => {
    const stats = make().populationStats();
    expect(stats.population).toBeGreaterThan(stats.employed);
    expect(stats.households).toBeGreaterThan(0);
    expect(stats.perDistrict.map((d) => d.districtId)).toEqual(FIXTURE_BLUEPRINT.districts.map((d) => d.id));
    expect(stats.perDistrict.reduce((sum, d) => sum + d.population, 0)).toBe(stats.population);
    expect(stats.perDistrict.reduce((sum, d) => sum + d.households, 0)).toBe(stats.households);
    expect(Object.values(stats.typeCounts).reduce((sum, n) => sum + n, 0)).toBe(stats.employed + stats.unemployed);
    for (const district of stats.perDistrict) {
      expect(Object.values(district.byTier).reduce((sum, tier) => sum + tier.population, 0)).toBe(district.population);
    }
    expect(stats.perDistrict.find((d) => d.districtId === 'd2')?.population).toBe(0);
  });

  it('calibrates a positive blueprint population and respects occupancy and employment settings', () => {
    const baseline = make().populationStats();
    const target = baseline.population * 2;
    const calibrated = make({ blueprint: { ...FIXTURE_BLUEPRINT, stats: { ...FIXTURE_BLUEPRINT.stats, population: target } } }).populationStats();
    expect(calibrated.calibrationFactor).toBeGreaterThan(1);
    expect(Math.abs(calibrated.population - target) / target).toBeLessThanOrEqual(0.03);
    const sparse = make({ params: { occupancyRate: 0.1, unemploymentRate: 1 } }).populationStats();
    expect(sparse.population).toBeLessThan(baseline.population);
    expect(sparse.employed).toBe(0);
  });

  it('uses supplied household and gender weights with reciprocal family identities', () => {
    const coupleParams = {
      householdMix: { single: 0, couple: 1, coupleKids: 0, singleParent: 0, shared: 0 },
      sameGenderCoupleShare: 1,
    };
    const sim = make({ params: coupleParams });
    const person = vendor(sim);
    const stub = person.family[0]!;
    expect(stub.relation).toBe('partner');
    const partner = sim.instantiate({ npcId: stub.npcId });
    expect(partner).toMatchObject({ name: stub.name, gender: person.gender, home: person.home });
    expect(partner.family[0]?.npcId).toBe(person.npcId);
    const reverse = make({ params: coupleParams });
    expect(reverse.instantiate({ npcId: partner.npcId }).gender).toBe(partner.gender);
    expect(reverse.instantiate({ npcId: person.npcId }).gender).toBe(person.gender);
    const single = vendor(make({ params: {
      femaleShare: 1, householdMix: { single: 1, couple: 0, coupleKids: 0, singleParent: 0, shared: 0 },
    } }));
    expect(single.gender).toBe('female');
    expect(single.family).toEqual([]);
  });

  it('consumes themed types, separates type from Interior role and honors the explicit name pool', () => {
    const support = { ...FIXTURE_INTERIORS.p_cafe!,
      roles: [{ ...FIXTURE_INTERIORS.p_cafe!.roles[0]!, role: 'receptionist' as const }],
    };
    const sim = make({ npcTypes: FIXTURE_THEMED_TYPES, interiors: { p_cafe: support } });
    const person = sim.getNPCVendor({ parcelId: 'p_cafe', type: 'corpo_coffee_barista', role: 'receptionist', timeMin: TIME });
    expect(person).toMatchObject({ type: 'corpo_coffee_barista', job: { role: 'receptionist' } });
    expect(FIXTURE_THEMED_TYPES.namePool.given).toContain(person.name.given);
    const override = vendor(make({ npcTypes: FIXTURE_THEMED_TYPES, namePool: { given: ['Wren'], family: ['Vale'] } }));
    expect(override.name).toEqual({ given: 'Wren', family: 'Vale' });
  });

  it('reports uncovered building and transit roles in type gaps', () => {
    const npcTypes = { ...FIXTURE_THEMED_TYPES, types: FIXTURE_THEMED_TYPES.types.filter((t) => t.category === 'resident') };
    const gaps = make({ npcTypes }).populationStats().typeGaps;
    expect(gaps).toContainEqual(expect.objectContaining({ role: 'vendor', parcelTypes: ['commerce', 'mall'] }));
    expect(gaps).toContainEqual(expect.objectContaining({ role: 'platform_staff', nonParcelPlaces: ['station'] }));
    expect(gaps).toContainEqual(expect.objectContaining({ role: 'driver', nonParcelPlaces: ['route'] }));
  });

  it('reproduces counts and established identities from seed and interaction order', () => {
    const a = make();
    const b = make();
    const crowd = a.crowd(TIME, { kind: 'city' });
    expect(b.populationStats()).toEqual(a.populationStats());
    expect(b.crowd(TIME, { kind: 'city' })).toEqual(crowd);
    expect(vendor(a)).toEqual(vendor(b));
    expect(make({ seed: 'another-city' }).populationStats()).not.toEqual(a.populationStats());
  });
});

describe('crowds and casting', () => {
  it('queries every sampled scope with default, custom and count-only bounds', () => {
    const sim = make({ params: { streetDensity: 20 } });
    const city = sim.crowd(TIME, { kind: 'city' });
    expect(city).toMatchObject({ timeMin: TIME, scope: { kind: 'city' } });
    expect(city.agents.length).toBeGreaterThan(0);
    expect(city.agents.length).toBeLessThanOrEqual(64);
    const district = sim.crowd(450, { kind: 'district', id: 'd2' }, { maxAgents: 2 });
    expect(total(district)).toBeGreaterThan(0);
    expect(district.agents.length).toBeLessThanOrEqual(2);
    const edge = sim.crowd(TIME, { kind: 'edge', id: 'e1' }, { maxAgents: 0 });
    expect(total(edge)).toBeGreaterThan(0);
    expect(edge.agents).toEqual([]);
    expect(sim.crowd(480, { kind: 'stop', id: 'b1' }).agents[0]?.activity).toBe('transit_wait');
    const post = sim.crowd(TIME, { kind: 'parcel', id: 'p_cafe' }).agents[0]!;
    const person = sim.instantiate({ crowdId: post.crowdId, timeMin: TIME });
    expect(person.npcId).toBe(vendor(sim).npcId);
    expect(person.appearanceSeed).toBe(post.appearanceSeed);
  });

  it('scales public presence and returns an uncapped radius limited to streets and stops', () => {
    const scope = { kind: 'radius' as const, x: 750, z: 250, metres: 120 };
    const quiet = make({ params: { streetDensity: 0 } }).crowd(720, scope);
    expect(quiet.agents).toEqual([]);
    const busy = make({ params: { streetDensity: 20 } }).crowd(720, scope, { maxAgents: 1 });
    expect(busy.agents.length).toBeGreaterThan(64);
    expect(busy.agents.length).toBe(total(busy));
    for (const agent of busy.agents) {
      expect(['edge', 'stop']).toContain(agent.place.kind);
      const edge = FIXTURE_BLUEPRINT.streets.edges.find((e) => e.id === agent.place.id);
      const start = edge?.path[0];
      const end = edge?.path.at(-1);
      const point = start && end
        ? [start[0] + (end[0] - start[0]) * agent.progress, start[1] + (end[1] - start[1]) * agent.progress]
        : FIXTURE_BLUEPRINT.transit.busStops.find((s) => s.id === agent.place.id)!.position;
      expect(Math.hypot(point[0]! - scope.x, point[1]! - scope.z)).toBeLessThanOrEqual(scope.metres);
    }
  });

  it('binds a displayed trip to one persistent person and rejects an expired unbound handle', () => {
    const sim = make();
    const [agent, other] = sim.crowd(720, { kind: 'edge', id: 'e1' }).agents;
    const person = sim.instantiate({ crowdId: agent!.crowdId, timeMin: agent!.trip.endMin });
    expect(person).toMatchObject({ type: agent!.type, gender: agent!.gender, appearanceSeed: agent!.appearanceSeed });
    expect(person.name.given).not.toBe('');
    expect(person.home.parcelId).not.toBe('');
    expect(sim.getNPC(person.npcId)).toBe(person);
    expect(sim.instantiate({ crowdId: agent!.crowdId, timeMin: agent!.trip.endMin + 1 })).toBe(person);
    expect(errorCode(() => sim.instantiate({ crowdId: other!.crowdId, timeMin: other!.trip.endMin + 1 }))).toBe('E_STALE_HANDLE');
  });

  it('allocates distinct staff through weekday, weekend and night shifts and refuses a closed cafe', () => {
    const sim = make();
    const morning = vendor(sim);
    const afternoon = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: 17 * 60 });
    const weekend = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: 6 * 1440 + TIME });
    expect(new Set([morning.npcId, afternoon.npcId, weekend.npcId]).size).toBe(3);
    expect(sim.getNPCVendor({ parcelId: 'p_police', timeMin: 180 }).job?.shift.kind).toBe('night');
    expect(sim.crowd(180, { kind: 'parcel', id: 'p_cafe' }).agents).toEqual([]);
    expect(errorCode(() => sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: 180 }))).toBe('E_NO_MATCH');
  });

  it('publishes station and route employment with supplied and fallback transit inputs', () => {
    const sim = make({ params: { defaultHeadwayMin: 18 } });
    const stationAgent = sim.crowd(TIME, { kind: 'stop', id: 's1' }).agents.find((a) => a.activity === 'working')!;
    const station = sim.instantiate({ crowdId: stationAgent.crowdId, timeMin: TIME });
    expect(station.job).toBeUndefined();
    expect(station.transitJob?.place).toEqual({ kind: 'stop', id: 's1' });
    const driver = sim.getNPCVendor({ role: 'driver', timeMin: TIME });
    expect(sim.behaviorAt(driver.npcId, TIME).mode).toBe('transit');
    const stops = FIXTURE_BLUEPRINT.transit.busStops.map((stop, index) => ({
      stopId: stop.id, x: stop.position[0], y: 0, z: stop.position[1], shapeDist: index * 200,
    }));
    const supplied = make({ networks: { walk: { nodes: [], edges: [] }, transit: { routes: [{
      id: 'network-route', kind: 'bus', lineId: 'r0', stops,
      template: stops.map((_, i) => ({ arrive: i * 120, depart: i * 120 })),
      service: [{ start: 18000, end: 86400, headway: 900, phase: 0 }],
    }] } } });
    expect(supplied.getNPCVendor({ role: 'driver', timeMin: TIME }).transitJob?.place.id).toBe('network-route');
    const commuter = [vendor(sim), sim.getNPCVendor({ parcelId: 'p_office', timeMin: TIME })]
      .flatMap((npc) => npc.routine).find((entry) => entry.transitLeg);
    expect(commuter?.transitLeg?.boardStopId).not.toBe(commuter?.transitLeg?.alightStopId);
  });

  it('reserves a named worker under every supported constraint and filters established identities', () => {
    const sim = make();
    const template = vendor(make());
    const districtId = FIXTURE_BLUEPRINT.parcels.find((p) => p.id === template.home.parcelId)!.districtId;
    const person = sim.reserveNPC({ name: { given: 'Wren', family: 'Vale' }, type: template.type,
      gender: template.gender, homeDistrictId: districtId, jobParcelId: 'p_cafe', role: 'barista' });
    expect(person).toMatchObject({ name: { given: 'Wren', family: 'Vale' }, gender: template.gender, job: { parcelId: 'p_cafe', role: 'barista' } });
    expect(sim.findNPCs({ type: person.type, districtId, parcelId: 'p_cafe' })).toEqual([person]);
    expect(sim.findNPCs({ type: 'absent' })).toEqual([]);
  });
});

describe('continuity and persistent effects', () => {
  it('projects a worker from home over authoritative network geometry into an Interior routine', () => {
    const prepared = routedInput();
    const sim = createSimulation(prepared);
    const person = sim.instantiate({ parcelId: 'p_cafe', timeMin: TIME });
    const walk = person.routine.find((entry) => entry.days.includes(0) && entry.walk?.to.id === 'p_cafe')!;
    expect(sim.continuityAt(person.npcId, walk.startMin - 1).behavior.mode).toBe('home');
    const moving = sim.continuityAt(person.npcId, walk.startMin + 0.5);
    expect(moving.animation).toBe('walk');
    expect(moving.schedule.nextDestination).toEqual({ kind: 'parcel', id: 'p_cafe' });
    expect(moving.schedule.progress).toBeGreaterThan(0);
    expect(moving.movement?.current.edgeId).toBe(moving.movement?.path[0]?.edgeId);
    for (const edge of moving.movement!.path) {
      const authored = prepared.networks!.walk.edges.find((item) => item.id === edge.edgeId)!.path3;
      expect(edge.path3).toEqual(edge.direction === 1 ? authored : [...authored].reverse());
    }
    const state = sim.continuityAt(person.npcId, TIME);
    expect(state.behavior).toMatchObject({ mode: 'interior', activity: 'working', place: { kind: 'parcel', id: 'p_cafe' } });
    expect(state.behavior.interior).toBeDefined();
    expect(sim.behaviorAt(person.npcId, TIME)).toEqual(state.behavior);
  });

  it('projects an Interior seated action and refuses an unprojectable walk', () => {
    const sim = make({ interiors: { p_cafe: { ...FIXTURE_INTERIORS.p_cafe!, routines: [{ role: 'r_barista',
      steps: [{ anchor: 'a_seat', minutes: [999, 999], animation: 'idle_sit' }],
    }] } } });
    const person = vendor(sim);
    expect(sim.continuityAt(person.npcId, TIME).animation).toBe('sit');
    const walk = person.routine.find((entry) => entry.days.includes(0) && entry.activity === 'commuting' && !entry.transitLeg)!;
    expect(errorCode(() => sim.continuityAt(person.npcId, walk.startMin))).toBe('E_NO_MATCH');
  });

  it('replays every event kind, preserves interrupted progress and resumes the current schedule', () => {
    const prepared = routedInput();
    const sim = createSimulation(prepared);
    const person = vendor(sim);
    sim.instantiate({ npcId: person.npcId });
    const post = sim.crowd(TIME, { kind: 'parcel', id: 'p_cafe' }).agents[0]!;
    sim.instantiate({ crowdId: post.crowdId, timeMin: TIME });
    sim.reserveNPC({ name: { given: 'Vesna', family: 'Ilic' }, type: 'resident_low' });
    sim.applyFlag(person.npcId, { kind: 'custom', tag: 'quest:informant' });
    const walk = person.routine.find((entry) => entry.days.includes(0) && entry.walk)!;
    const at = walk.startMin + 0.5;
    sim.interrupt(person.npcId, at);
    sim.resume(person.npcId, at + 1);
    sim.interrupt(person.npcId, at);
    const frozen = sim.continuityAt(person.npcId, TIME);
    const save = JSON.parse(JSON.stringify(sim.serialize()));
    expect(save.version).toBe('1');
    const restored = restoreSimulation(prepared, save);
    expect(restored.findNPCs({ includeDead: true })).toEqual(sim.findNPCs({ includeDead: true }));
    expect(restored.serialize()).toEqual(save);
    expect(restored.continuityAt(person.npcId, TIME)).toEqual(frozen);
    expect(frozen.behavior.interrupted).toBe(true);
    restored.resume(person.npcId, TIME);
    expect(restored.behaviorAt(person.npcId, TIME)).toMatchObject({ activity: 'working', interrupted: false });
    const target = createSimulation(prepared);
    target.restore(save);
    expect(target.getNPC(person.npcId)).toEqual(person);
  });

  it('applies resignation, promotion and custom flags and reports an employment conflict', () => {
    const sim = make();
    const person = vendor(sim);
    sim.applyFlag(person.npcId, { kind: 'resign' });
    expect(sim.getNPC(person.npcId).job).toBeUndefined();
    expect(errorCode(() => sim.applyFlag(person.npcId, { kind: 'resign' }))).toBe('E_CONFLICT');
    sim.applyFlag(person.npcId, { kind: 'promote', toParcelId: 'p_office' });
    expect(sim.getNPC(person.npcId).job).toMatchObject({ parcelId: 'p_office', role: 'executive' });
    sim.applyFlag(person.npcId, { kind: 'custom', tag: 'quest:informant' });
    expect(sim.findNPCs({ flag: 'quest:informant' })).toEqual([person]);
  });

  it('excludes dead people from ordinary searches and refuses behavior', () => {
    const sim = make();
    const person = vendor(sim);
    sim.applyFlag(person.npcId, { kind: 'die' });
    expect(sim.findNPCs({})).toEqual([]);
    expect(sim.findNPCs({ includeDead: true })).toEqual([person]);
    expect(errorCode(() => sim.behaviorAt(person.npcId, TIME))).toBe('E_DEAD');
  });
});

describe('admission errors', () => {
  it('reports invalid construction, radius and replay input through the closed input code', () => {
    const cases = [
      () => make({ params: { occupancyRate: -1 } }),
      () => make().crowd(TIME, { kind: 'radius', x: 0, z: 0, metres: 0 }),
      () => restoreSimulation(input(), { version: '1', seed: 'another', events: [] }),
      () => restoreSimulation(input(), { version: '1', seed: 'urbe-test-1', events: [{ k: 'unknown' }] } as never),
    ];
    for (const run of cases) expect(errorCode(run)).toBe('E_INVALID_INPUT');
  });

  it('rejects unknown identifiers including sidewalk-free edges', () => {
    const sim = make();
    expect(errorCode(() => sim.getNPC('absent'))).toBe('E_UNKNOWN_ID');
    expect(errorCode(() => sim.crowd(TIME, { kind: 'edge', id: 'e_deck' }))).toBe('E_UNKNOWN_ID');
  });

  it('rejects unsupported query times', () => {
    expect(errorCode(() => make().crowd(-1, { kind: 'city' }))).toBe('E_TIME');
  });
});
