import { describe, expect, it } from 'vitest';
import {
  CitySimulation, createSimulation, restoreSimulation, SimulationError,
  DEFAULT_TYPE_SET, FIXTURE_BLUEPRINT, FIXTURE_INTERIORS, FIXTURE_THEMED_TYPES,
  type CrowdScope, type CrowdSlice, type Networks, type NpcSupport, type NPCInstance, type SimulationInput,
} from './index.js';

/** Monday 09:00: the cafe is open and commuters are out. */
const TIME = 540;

/** One prepared city for the whole suite: Atlas places and Interior roles, plus the walk
 *  graph with authoritative path3 that the promises about walking travel need. */
function walkNetwork(): Networks {
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
  return { walk: { nodes, edges }, transit: { routes: [] } };
}

const FIXTURE: SimulationInput = {
  seed: 'urbe-test-1', blueprint: FIXTURE_BLUEPRINT, interiors: FIXTURE_INTERIORS,
};
const WALK = walkNetwork();

const make = (overrides: Partial<SimulationInput> = {}): CitySimulation =>
  createSimulation({ ...FIXTURE, ...overrides });
const vendor = (sim: CitySimulation): NPCInstance => sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: TIME });
const total = (slice: CrowdSlice): number => slice.groups.reduce((sum, group) => sum + group.count, 0);

function errorCode(run: () => unknown): string | undefined {
  try { run(); } catch (error) {
    expect(error).toBeInstanceOf(SimulationError);
    return (error as SimulationError).code;
  }
  return undefined;
}

describe('prepared inputs and statistics', () => {
  it('reports one population projection: defaults, district and tier totals, type counts and gaps', () => {
    const base = { seed: 42, blueprint: FIXTURE_BLUEPRINT };
    const defaults = new CitySimulation(base);
    const explicit = createSimulation({ ...base, npcTypes: DEFAULT_TYPE_SET, params: {
      occupancyRate: 0.55, unemploymentRate: 0.041, femaleShare: 0.51, sameGenderCoupleShare: 0.03,
      householdMix: { single: 0.29, couple: 0.27, coupleKids: 0.21, singleParent: 0.1, shared: 0.13 },
      shiftMix: { day: 0.84, evening: 0.06, night: 0.04, rotating: 0.06 },
      streetDensity: 1, defaultHeadwayMin: 12,
    } });
    expect(defaults.populationStats()).toEqual(explicit.populationStats());

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

    const residentsOnly = { ...FIXTURE_THEMED_TYPES, types: FIXTURE_THEMED_TYPES.types.filter((t) => t.category === 'resident') };
    const gaps = make({ npcTypes: residentsOnly }).populationStats().typeGaps;
    expect(gaps).toContainEqual(expect.objectContaining({ role: 'vendor', parcelTypes: ['commerce', 'mall'] }));
    expect(gaps).toContainEqual(expect.objectContaining({ role: 'platform_staff', nonParcelPlaces: ['station'] }));
    expect(gaps).toContainEqual(expect.objectContaining({ role: 'driver', nonParcelPlaces: ['route'] }));
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
    const sim = make({ params: {
      householdMix: { single: 0, couple: 1, coupleKids: 0, singleParent: 0, shared: 0 },
      sameGenderCoupleShare: 1,
    } });
    const person = vendor(sim);
    const stub = person.family[0]!;
    expect(stub.relation).toBe('partner');
    const partner = sim.instantiate({ npcId: stub.npcId });
    expect(partner).toMatchObject({ name: stub.name, gender: person.gender, home: person.home });
    expect(partner.family[0]?.npcId).toBe(person.npcId);
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

  it('establishes a person in the hinted look, leaves an established look alone and replays both', () => {
    const sim = make();
    const edge: CrowdScope = { kind: 'edge', id: 'e1' };
    const agent = sim.crowd(720, edge).agents[0]!;
    const handle = { crowdId: agent.crowdId, timeMin: 720 };
    const hint = (agent.appearanceSeed + 1) % 2 ** 32;
    for (const appearanceSeed of [-1, 1.5, 2 ** 32]) {
      expect(errorCode(() => sim.instantiate({ ...handle, appearanceSeed }))).toBe('E_INVALID_INPUT');
    }
    expect(sim.serialize().events).toEqual([]);

    const person = sim.instantiate({ ...handle, appearanceSeed: hint });
    expect(person).toEqual({ ...make().instantiate(handle), appearanceSeed: hint });
    expect(sim.instantiate({ ...handle, appearanceSeed: agent.appearanceSeed })).toBe(person);
    expect(person.appearanceSeed).toBe(hint);
    const sample = sim.crowd(720, edge);
    expect(sample.agents[0]).toEqual({ ...agent, npcId: person.npcId, appearanceSeed: hint });

    const worker = vendor(sim);
    const own = worker.appearanceSeed;
    const post = sim.crowd(TIME, { kind: 'parcel', id: 'p_cafe' }).agents.find((a) => a.npcId === worker.npcId)!;
    expect(sim.instantiate({ crowdId: post.crowdId, timeMin: TIME, appearanceSeed: (own + 1) % 2 ** 32 })).toBe(worker);
    expect(worker.appearanceSeed).toBe(own);

    const save = JSON.parse(JSON.stringify(sim.serialize()));
    expect(save.events[0]).toEqual({ k: 'crowd', ...handle, appearanceSeed: hint });
    const restored = restoreSimulation(FIXTURE, save);
    expect(restored.findNPCs({})).toEqual(sim.findNPCs({}));
    expect(restored.crowd(720, edge)).toEqual(sample);
    expect(restored.serialize()).toEqual(save);
    const invalid = { ...save, events: [{ ...save.events[0], appearanceSeed: -1 }] };
    expect(errorCode(() => restoreSimulation(FIXTURE, invalid))).toBe('E_INVALID_INPUT');

    const unhinted = restoreSimulation(FIXTURE, { version: '1', seed: String(FIXTURE.seed), events: [{ k: 'crowd', ...handle }] });
    expect(unhinted.getNPC(person.npcId).appearanceSeed).toBe(agent.appearanceSeed);
  });

  it.each(['vendor', 'reservation', 'npc id', 'station vendor'] as const)(
    'projects an established %s identity before its first crowd sample without establishing more people',
    (entry) => {
      const sim = make();
      const template = vendor(make());
      const person = entry === 'vendor' ? vendor(sim)
        : entry === 'station vendor' ? sim.getNPCVendor({ role: 'platform_staff', timeMin: TIME })
        : entry === 'npc id' ? sim.instantiate({ npcId: template.npcId })
        : sim.reserveNPC({ name: { given: 'Wren', family: 'Vale' }, type: template.type,
          gender: template.gender, jobParcelId: 'p_cafe', role: 'barista' });
      const work = person.routine.find((step) => step.activity === 'working')!;
      const timeMin = work.days[0]! * 1440 + work.startMin + 1;
      const scope: CrowdScope = person.job
        ? { kind: 'parcel', id: person.job.parcelId }
        : { kind: 'stop', id: person.transitJob!.place.id };
      const save = sim.serialize();
      expect(save.events.every((event) => event.k !== 'crowd')).toBe(true);
      const sample = sim.crowd(timeMin, scope);
      expect(sample.agents.filter((agent) => agent.npcId === person.npcId)).toEqual([
        expect.objectContaining({ activity: 'working', appearanceSeed: person.appearanceSeed }),
      ]);
      expect(sample.agents.every((agent) => agent.npcId === undefined || agent.npcId === person.npcId)).toBe(true);
      expect(sim.populationStats().instances).toBe(1);
      expect(sim.serialize()).toEqual(save);
      const restored = restoreSimulation(FIXTURE, save);
      expect(restored.crowd(timeMin, scope)).toEqual(sample);
      expect(restored.populationStats().instances).toBe(1);
      expect(restored.serialize()).toEqual(save);
    },
  );

  it.each([
    { kind: 'edge' as const, id: 'e1', timeMin: 720 },
    { kind: 'stop' as const, id: 'b1', timeMin: 480 },
    { kind: 'parcel' as const, id: 'p_rest', timeMin: 21 * 60 },
  ])('projects only bound anonymous $kind identities and replays them without mutating crowd reads', ({ kind, id, timeMin }) => {
    const input = { ...FIXTURE, params: { streetDensity: 20 } };
    const sim = createSimulation(input);
    const scope = { kind, id };
    const untouchedSave = sim.serialize();
    const before = sim.crowd(timeMin, scope);
    expect(before.agents.every((agent) => !('npcId' in agent))).toBe(true);
    expect(sim.populationStats().instances).toBe(0);
    expect(sim.serialize()).toEqual(untouchedSave);
    const anonymous = before.agents.find((agent) => agent.activity !== 'working')!;
    const person = sim.instantiate({ crowdId: anonymous.crowdId, timeMin });
    const save = sim.serialize();
    const sample = sim.crowd(timeMin, scope);
    expect(sample.agents.find((agent) => agent.crowdId === anonymous.crowdId)).toEqual({ ...anonymous, npcId: person.npcId });
    expect(sample.groups).toEqual(before.groups);
    expect(sample.agents.length).toBe(before.agents.length);
    expect(sample.agents.filter((agent) => agent.activity !== 'working' && agent.crowdId !== anonymous.crowdId)
      .every((agent) => !('npcId' in agent))).toBe(true);
    const later = sim.crowd(anonymous.trip.endMin + 1, scope);
    expect(later.agents.filter((agent) => agent.activity !== 'working').every((agent) => !('npcId' in agent))).toBe(true);
    expect(sim.populationStats().instances).toBe(1);
    expect(sim.serialize()).toEqual(save);
    const restored = restoreSimulation(input, save);
    expect(restored.crowd(timeMin, scope)).toEqual(sample);
    expect(restored.populationStats().instances).toBe(1);
    expect(restored.serialize()).toEqual(save);
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

  it('keeps a service venue staffed into the evening and seats guests while it is open', () => {
    const sim = make();
    const evening = 21 * 60;
    const slice = sim.crowd(evening, { kind: 'parcel', id: 'p_rest' });
    const staff = slice.agents.filter((agent) => agent.activity === 'working');
    const guests = slice.agents.filter((agent) => agent.activity === 'leisure');
    expect(staff.length).toBeGreaterThan(0);
    expect(guests.length).toBeGreaterThan(0);
    expect(total(slice)).toBe(slice.agents.length);
    expect(sim.getNPCVendor({ parcelId: 'p_rest', timeMin: evening }).job?.shift.kind).toBe('evening');
    const guest = sim.instantiate({ crowdId: guests[0]!.crowdId, timeMin: evening });
    expect(guest).toMatchObject({ type: guests[0]!.type, gender: guests[0]!.gender });
    expect(sim.crowd(4 * 60, { kind: 'parcel', id: 'p_rest' }).agents).toEqual([]);
  });

  it('leaves an office venue to its watch outside office hours', () => {
    const sim = make();
    const evening = 21 * 60;
    expect(sim.crowd(11 * 60, { kind: 'parcel', id: 'p_office' }).agents.length).toBeGreaterThan(1);
    const night = sim.crowd(evening, { kind: 'parcel', id: 'p_office' }).agents;
    expect(night.length).toBe(1);
    const guard = sim.instantiate({ crowdId: night[0]!.crowdId, timeMin: evening });
    expect(guard.job).toMatchObject({ parcelId: 'p_office', role: 'security' });
    expect(sim.getNPCVendor({ parcelId: 'p_office', timeMin: evening }).npcId).toBe(guard.npcId);
    expect(sim.getNPCVendor({ parcelId: 'p_office', timeMin: 10 * 60 }).job?.role).toBe('office_worker');
  });

  it('staffs a venue with the roles Interior publishes plus its own counter service', () => {
    const at = 21 * 60 + 4;
    const furnish = (buildingId: string, roles: NpcSupport['roles']): NpcSupport =>
      ({ ...FIXTURE_INTERIORS.p_cafe!, buildingId, roles });
    const rolesOnDuty = (sim: CitySimulation, parcelId: string): Set<string | undefined> =>
      new Set(sim.crowd(at, { kind: 'parcel', id: parcelId }).agents
        .filter((agent) => agent.activity === 'working')
        .map((agent) => sim.instantiate({ crowdId: agent.crowdId, timeMin: at }).job?.role));

    const cleaned = make({ interiors: { ...FIXTURE_INTERIORS, p_rest: furnish('p_rest', [
      { id: 'r_clean', role: 'cleaner', floor: 0, homeAnchor: 'a_counter', count: [1, 1] },
      { id: 'r_guest', role: 'guest', floor: 0, homeAnchor: 'a_seat', count: [8, 8] },
    ]) } });
    expect(rolesOnDuty(cleaned, 'p_rest')).toEqual(new Set(['waiter', 'cleaner']));
    expect(cleaned.getNPCVendor({ parcelId: 'p_rest', timeMin: at }).job?.role).toBe('waiter');
    expect(errorCode(() => cleaned.getNPCVendor({ parcelId: 'p_rest', role: 'guest', timeMin: at }))).toBe('E_NO_MATCH');

    const served = make({ interiors: { ...FIXTURE_INTERIORS, p_corpo: furnish('p_corpo', [
      { id: 'r_vendor', role: 'vendor', floor: 0, homeAnchor: 'a_counter', count: [1, 1] },
      { id: 'r_reception', role: 'receptionist', floor: 0, homeAnchor: 'a_counter', count: [1, 1] },
    ]) } });
    const server = served.getNPCVendor({ parcelId: 'p_corpo', role: 'vendor', timeMin: at });
    expect(served.behaviorAt(server.npcId, at)).toMatchObject({ activity: 'working', place: { kind: 'parcel', id: 'p_corpo' } });
    expect(rolesOnDuty(served, 'p_corpo')).toEqual(new Set(['vendor', 'receptionist']));
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
    const supplied = make({ networks: { walk: WALK.walk, transit: { routes: [{
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

  it('draws a seeded age and two to four traits for every established person', () => {
    const person = vendor(make());
    expect(Number.isInteger(person.age)).toBe(true);
    expect(person.age).toBeGreaterThanOrEqual(18);
    expect(person.traits.length).toBeGreaterThanOrEqual(2);
    expect(person.traits.length).toBeLessThanOrEqual(4);
    expect(new Set(person.traits).size).toBe(person.traits.length);
    expect(vendor(make())).toEqual(person);

    const families = make({ params: { householdMix: { single: 0, couple: 0, coupleKids: 1, singleParent: 0, shared: 0 } } });
    const parent = vendor(families);
    const child = families.instantiate({ npcId: parent.family.find((member) => member.relation === 'child')!.npcId });
    expect(child.age).toBeLessThanOrEqual(17);
  });

  it('caps established people and reports the count against the capacity', () => {
    expect(make().populationStats().capacity).toBe(100);
    const sim = make({ params: { maxInstances: 1 } });
    expect(sim.populationStats()).toMatchObject({ instances: 0, capacity: 1 });
    const person = vendor(sim);
    expect(sim.populationStats().instances).toBe(1);
    expect(vendor(sim)).toBe(person);
    expect(errorCode(() => sim.reserveNPC({ name: { given: 'Wren', family: 'Vale' }, type: 'resident_low' }))).toBe('E_CAPACITY');
    const agent = sim.crowd(720, { kind: 'edge', id: 'e1' }).agents[0]!;
    expect(errorCode(() => sim.instantiate({ crowdId: agent.crowdId, timeMin: 720 }))).toBe('E_CAPACITY');
  });
});

describe('continuity and persistent effects', () => {
  it('projects a commute over authoritative network geometry into an Interior routine', () => {
    const sim = make({ networks: WALK });
    const person = sim.instantiate({ parcelId: 'p_cafe', timeMin: TIME });
    const walk = person.routine.find((entry) => entry.days.includes(0) && entry.walk?.to.id === 'p_cafe')!;
    const moving = sim.continuityAt(person.npcId, walk.startMin + 0.5);
    expect(moving.animation).toBe('walk');
    expect(moving.schedule.nextDestination).toEqual({ kind: 'parcel', id: 'p_cafe' });
    expect(moving.schedule.progress).toBeGreaterThan(0);
    expect(moving.movement?.current.edgeId).toBe(moving.movement?.path[0]?.edgeId);
    for (const edge of moving.movement!.path) {
      const authored = WALK.walk.edges.find((item) => item.id === edge.edgeId)!.path3;
      expect(edge.path3).toEqual(edge.direction === 1 ? authored : [...authored].reverse());
    }
    const state = sim.continuityAt(person.npcId, TIME);
    expect(state.behavior).toMatchObject({ mode: 'interior', activity: 'working', place: { kind: 'parcel', id: 'p_cafe' } });
    expect(state.behavior.interior).toBeDefined();
    expect(sim.behaviorAt(person.npcId, TIME)).toEqual(state.behavior);

    const unprepared = make();
    const worker = vendor(unprepared);
    const onFoot = worker.routine.find((entry) => entry.days.includes(0) && entry.activity === 'commuting' && !entry.transitLeg)!;
    expect(errorCode(() => unprepared.continuityAt(worker.npcId, onFoot.startMin))).toBe('E_NO_MATCH');
  });

  it('gives a stay in an unfurnished building an arrival, an inside step and an exit', () => {
    const sim = make({ interiors: {} });
    const person = sim.instantiate({ parcelId: 'p_cafe', timeMin: TIME });
    const interiorAt = (minute: number): unknown => sim.behaviorAt(person.npcId, minute).interior;
    const work = person.routine.find((entry) => entry.days.includes(0) && entry.activity === 'working')!;
    expect(sim.behaviorAt(person.npcId, work.startMin).mode).toBe('interior');
    expect(interiorAt(work.startMin)).toEqual({ walk: { fromAnchorId: 'placeholder:p_cafe/entrance', toAnchorId: 'placeholder:p_cafe/inside' } });
    expect(interiorAt(Math.floor((work.startMin + work.endMin) / 2))).toMatchObject({ at: { anchorId: 'placeholder:p_cafe/inside', animation: 'work_type' } });
    expect(interiorAt(work.endMin)).toEqual({ walk: { fromAnchorId: 'placeholder:p_cafe/inside', toAnchorId: 'placeholder:p_cafe/entrance' } });

    const sleep = person.routine.find((entry) => entry.days.includes(0) && entry.activity === 'sleeping')!;
    const night = sim.behaviorAt(person.npcId, Math.floor((sleep.startMin + sleep.endMin) / 2));
    expect(night.mode).toBe('home');
    expect(night.interior).toMatchObject({ at: { anchorId: `placeholder:${person.home.parcelId}/inside`, animation: 'sleep' } });
  });

  it('replays every event kind, preserves interrupted progress and resumes the current schedule', () => {
    const prepared = { ...FIXTURE, networks: WALK };
    const sim = createSimulation(prepared);
    const person = vendor(sim);
    sim.instantiate({ npcId: person.npcId });
    const post = sim.crowd(TIME, { kind: 'parcel', id: 'p_cafe' }).agents[0]!;
    sim.instantiate({ crowdId: post.crowdId, timeMin: TIME });
    sim.reserveNPC({ name: { given: 'Vesna', family: 'Ilic' }, type: 'resident_low' });
    sim.applyFlag(person.npcId, { kind: 'custom', tag: 'quest:informant' });
    const walk = person.routine.find((entry) => entry.days.includes(0) && entry.walk?.edges.length)!;
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

  it('applies resignation, promotion, custom tags and death to the established record', () => {
    const sim = make();
    const person = vendor(sim);
    sim.applyFlag(person.npcId, { kind: 'resign' });
    expect(sim.getNPC(person.npcId).job).toBeUndefined();
    expect(errorCode(() => sim.applyFlag(person.npcId, { kind: 'resign' }))).toBe('E_CONFLICT');
    sim.applyFlag(person.npcId, { kind: 'promote', toParcelId: 'p_office' });
    expect(sim.getNPC(person.npcId).job).toMatchObject({ parcelId: 'p_office', role: 'executive' });
    sim.applyFlag(person.npcId, { kind: 'custom', tag: 'quest:informant' });
    expect(sim.findNPCs({ flag: 'quest:informant' })).toEqual([person]);
    sim.applyFlag(person.npcId, { kind: 'die' });
    expect(sim.findNPCs({})).toEqual([]);
    expect(sim.findNPCs({ includeDead: true })).toEqual([person]);
    expect(errorCode(() => sim.behaviorAt(person.npcId, TIME))).toBe('E_DEAD');
  });
});

it('reports invalid input, unknown identifiers and unsupported times through the closed error set', () => {
  expect(errorCode(() => make({ params: { occupancyRate: -1 } }))).toBe('E_INVALID_INPUT');
  expect(errorCode(() => restoreSimulation(FIXTURE, { version: '1', seed: 'another', events: [] }))).toBe('E_INVALID_INPUT');
  expect(errorCode(() => make().getNPC('absent'))).toBe('E_UNKNOWN_ID');
  expect(errorCode(() => make().crowd(-1, { kind: 'city' }))).toBe('E_TIME');
});
