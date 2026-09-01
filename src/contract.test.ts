/**
 * Contract tests: every promise in CONTRACT.md exercised through the public
 * entry point against the standalone fixture city. No internals are imported.
 */

import { describe, expect, it } from 'vitest';
import { createSimulation, restoreSimulation, SimulationError } from './index.js';
import { FIXTURE_BLUEPRINT, FIXTURE_INTERIORS } from './fixtures/small-city.js';
import type { CitySimulation, NPCInstance, SimulationInput } from './index.js';

const SEED = 'urbe-test-1';
const MON_9 = 9 * 60;
const MON_NOON = 12 * 60;
const MON_3AM = 3 * 60;

function makeInput(): SimulationInput {
  return { seed: SEED, blueprint: FIXTURE_BLUEPRINT, interiors: FIXTURE_INTERIORS };
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

  it('every blueprint district is on the surface, including industrial ones without residents', () => {
    const sim = make();
    const stats = sim.populationStats();
    expect(stats.perDistrict.map((d) => d.districtId).sort()).toEqual(['d0', 'd1', 'd2']);
    const industrial = stats.perDistrict.find((d) => d.districtId === 'd2')!;
    expect(industrial.population).toBe(0);
    const commute = sim.crowd(7 * 60 + 30, { kind: 'district', id: 'd2' });
    expect(commute.groups.reduce((s, g) => s + g.count, 0)).toBeGreaterThan(0);
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

    const busy = createSimulation({ ...makeInput(), params: { crowdScale: 20 } });
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

  it('a parcel scope reports on-duty workers', () => {
    const sim = make();
    const cafeDay = sim.crowd(MON_9, { kind: 'parcel', id: 'p_cafe' });
    expect(cafeDay.groups.reduce((s, g) => s + g.count, 0)).toBeGreaterThan(0);
    const policeNight = sim.crowd(MON_3AM, { kind: 'parcel', id: 'p_police' });
    expect(policeNight.groups.reduce((s, g) => s + g.count, 0)).toBeGreaterThan(0);
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

  it('a stale crowd handle is rejected', () => {
    const sim = make();
    const agent = sim.crowd(MON_NOON, { kind: 'edge', id: 'e1' }).agents[0]!;
    expect(code(() => sim.instantiate({ crowdId: agent.crowdId, timeMin: MON_NOON + 6 * 60 }))).toBe('E_STALE_HANDLE');
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

describe('vendor queries and staffing', () => {
  it('finds the on-duty barista at the cafe, on shift, with an interior role', () => {
    const sim = make();
    const vendor = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
    expect(vendor.job).toBeDefined();
    expect(vendor.job!.parcelId).toBe('p_cafe');
    expect(vendor.job!.role).toBe('barista');
    const repeat = sim.getNPCVendor({ parcelId: 'p_cafe', timeMin: MON_9 });
    expect(repeat.npcId).toBe(vendor.npcId);
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
    const reserved = sim.reserveNPC({ name: { given: 'Vesna', family: 'Ilic' }, type: 'resident_low' });
    expect(reserved.name).toEqual({ given: 'Vesna', family: 'Ilic' });
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
