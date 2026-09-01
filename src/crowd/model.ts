/**
 * Cheap crowd layer: closed-form typed counts per scope and time, plus stable
 * pseudo-agents. No per-NPC computation; cost is independent of population.
 * Curves approximate the ACS departure-time distribution and evening leisure.
 */

import { hash01, rand } from '../core/rng.js';
import { dayOf, minuteOfDay } from '../core/time.js';
import { shiftCoversTime } from '../population/jobs.js';
import { SimulationError } from '../schemas/errors.js';
import type { AssignmentModel } from '../population/assignment.js';
import type { WorldModel, CrowdEdge } from '../world/model.js';
import type { ResolvedParams } from '../population/defaults.js';
import type { NPCTypeSet, NPCCategory } from '../schemas/npc-types.js';
import type { PopulationStats } from '../schemas/population.js';
import type { Activity, CrowdAgent, CrowdGroup, CrowdScope, CrowdSlice } from '../schemas/crowd.js';

interface DistrictCrowdBase {
  districtId: string;
  typeCounts: Record<string, number>;
  edges: CrowdEdge[];
  edgeLengthTotal: number;
}

/** Piecewise-linear outdoor fraction curve points: [minuteOfDay, fraction]. */
type Curve = [number, number][];

const WORKER_COMMUTE: Curve = [
  [0, 0.005], [300, 0.01], [390, 0.06], [450, 0.14], [510, 0.16], [570, 0.08], [720, 0.04],
  [780, 0.05], [960, 0.09], [1020, 0.14], [1140, 0.07], [1260, 0.02], [1439, 0.005],
];
const RESIDENT_OUT: Curve = [
  [0, 0.004], [420, 0.01], [540, 0.05], [720, 0.09], [840, 0.1], [1020, 0.08], [1140, 0.05], [1320, 0.015], [1439, 0.005],
];
const STREET_OUT: Curve = [
  [0, 0.18], [360, 0.2], [540, 0.35], [1080, 0.38], [1320, 0.28], [1439, 0.2],
];

function curveAt(curve: Curve, m: number): number {
  let prev = curve[0]!;
  for (const point of curve) {
    if (point[0] >= m) {
      const [x1, y1] = prev;
      const [x2, y2] = point;
      if (x2 === x1) return y2;
      return y1 + ((y2 - y1) * (m - x1)) / (x2 - x1);
    }
    prev = point;
  }
  return prev[1];
}

export class CrowdModel {
  private readonly districts = new Map<string, DistrictCrowdBase>();
  private readonly categoryByType = new Map<string, NPCCategory>();

  constructor(
    private readonly seed: string | number,
    private readonly world: WorldModel,
    stats: PopulationStats,
    typeSet: NPCTypeSet,
    private readonly params: ResolvedParams,
    private readonly assignment: AssignmentModel,
  ) {
    for (const t of typeSet.types) this.categoryByType.set(t.type, t.category);
    for (const d of stats.perDistrict) {
      const typeCounts: Record<string, number> = {};
      for (const tier of Object.values(d.byTier)) {
        for (const [type, n] of Object.entries(tier.typeCounts)) typeCounts[type] = (typeCounts[type] ?? 0) + n;
      }
      const edges = world.crowdEdges.filter((e) => e.districtId === d.districtId);
      this.districts.set(d.districtId, {
        districtId: d.districtId,
        typeCounts,
        edges,
        edgeLengthTotal: edges.reduce((s, e) => s + e.lengthM, 0),
      });
    }
  }

  crowd(timeMin: number, scope: CrowdScope): CrowdSlice {
    if (!Number.isFinite(timeMin) || timeMin < 0) throw new SimulationError('E_TIME', `invalid time ${timeMin}`);
    switch (scope.kind) {
      case 'city': {
        const groups = new Map<string, CrowdGroup>();
        for (const base of this.districts.values()) this.accumulate(groups, base, timeMin, 1);
        return { timeMin, scope, groups: [...groups.values()], agents: [] };
      }
      case 'district': {
        const base = this.districts.get(scope.id ?? '');
        if (!base) throw new SimulationError('E_UNKNOWN_ID', `no district ${scope.id}`);
        const groups = new Map<string, CrowdGroup>();
        this.accumulate(groups, base, timeMin, 1);
        return { timeMin, scope, groups: [...groups.values()], agents: [] };
      }
      case 'edge':
        return this.edgeSlice(timeMin, scope);
      case 'stop': {
        if (!this.world.stopsById.has(scope.id ?? '')) throw new SimulationError('E_UNKNOWN_ID', `no stop ${scope.id}`);
        const districtId = this.world.districtAt(this.world.stopsById.get(scope.id!)!.position);
        const base = this.districts.get(districtId);
        const groups = new Map<string, CrowdGroup>();
        if (base) this.accumulate(groups, base, timeMin, 0.05, 'transit_wait');
        return { timeMin, scope, groups: [...groups.values()], agents: [] };
      }
      case 'parcel': {
        const wp = this.world.workplacesByParcel.get(scope.id ?? '');
        if (!wp && !this.world.parcelsById.has(scope.id ?? '')) {
          throw new SimulationError('E_UNKNOWN_ID', `no parcel ${scope.id}`);
        }
        const groups = new Map<string, CrowdGroup>();
        if (wp) {
          for (let local = 0; local < wp.staffing.slotCount; local++) {
            const job = this.assignment.jobOfSlot(wp.slotOffset + local);
            if (!shiftCoversTime(job.shift, timeMin)) continue;
            if (this.assignment.adultOfSlot(wp.slotOffset + local) === undefined) continue;
            const type = this.assignment.typeOfAdult(this.assignment.adultOfSlot(wp.slotOffset + local)!).type;
            const key = `${type}:working`;
            const cur = groups.get(key);
            if (cur) cur.count += 1;
            else groups.set(key, { type, activity: 'working', count: 1 });
          }
        }
        return { timeMin, scope, groups: [...groups.values()], agents: [] };
      }
    }
  }

  /** Recompute the agent a crowdId names at a time; undefined when it is not alive then. */
  agentAt(crowdId: string, timeMin: number): CrowdAgent | undefined {
    const parts = crowdId.split('|');
    if (parts.length !== 4 || parts[0] !== 'c') return undefined;
    const slice = this.edgeSliceSafe(timeMin, { kind: 'edge', id: parts[1]! });
    return slice?.agents.find((a) => a.crowdId === crowdId);
  }

  private edgeSliceSafe(timeMin: number, scope: CrowdScope): CrowdSlice | undefined {
    try {
      return this.edgeSlice(timeMin, scope);
    } catch {
      return undefined;
    }
  }

  private edgeSlice(timeMin: number, scope: CrowdScope): CrowdSlice {
    const edge = this.world.crowdEdges.find((e) => e.id === scope.id);
    if (!edge) throw new SimulationError('E_UNKNOWN_ID', `no walk edge ${scope.id}`);
    const base = this.districts.get(edge.districtId);
    const groups = new Map<string, CrowdGroup>();
    if (base && base.edgeLengthTotal > 0) {
      this.accumulate(groups, base, timeMin, edge.lengthM / base.edgeLengthTotal);
    }
    const groupList = [...groups.values()];
    const total = groupList.reduce((s, g) => s + g.count, 0);
    const agents: CrowdAgent[] = [];
    const cap = Math.min(total, this.params.agentCap);
    const period = Math.max(2, Math.round(edge.lengthM / 80));
    const epoch = Math.floor(timeMin / period);
    const weights = groupList.map((g) => g.count);
    for (let i = 0; i < cap; i++) {
      const crowdId = `c|${edge.id}|${i}|${epoch}`;
      const r = rand(this.seed, 'agent', crowdId);
      const g = groupList[r.weighted(weights)]!;
      const phase = r.next();
      agents.push({
        crowdId,
        type: g.type,
        activity: g.activity,
        place: { kind: 'edge', id: edge.id },
        progress: (timeMin / period + phase) % 1,
        direction: r.next() < 0.5 ? 1 : -1,
      });
    }
    return { timeMin, scope, groups: groupList, agents };
  }

  private accumulate(
    groups: Map<string, CrowdGroup>,
    base: DistrictCrowdBase,
    timeMin: number,
    share: number,
    forceActivity?: Activity,
  ): void {
    const day = dayOf(timeMin);
    const m = minuteOfDay(timeMin);
    const weekend = day >= 5;
    for (const [type, count] of Object.entries(base.typeCounts)) {
      const category = this.categoryByType.get(type) ?? 'resident';
      let fraction: number;
      let activity: Activity;
      if (category === 'street') {
        fraction = curveAt(STREET_OUT, m);
        activity = 'leisure';
      } else if (!weekend && (category === 'worker' || category === 'vendor' || category === 'authority' || category === 'transit')) {
        fraction = curveAt(WORKER_COMMUTE, m);
        activity = m >= 660 && m < 840 ? 'leisure' : 'commuting';
      } else {
        fraction = curveAt(RESIDENT_OUT, m) * (weekend ? 1.2 : 1);
        activity = m >= 540 && m < 900 ? 'shopping' : 'leisure';
      }
      if (forceActivity) activity = forceActivity;
      const raw = count * fraction * this.params.crowdScale * share;
      const whole = Math.floor(raw);
      const extra = hash01(this.seed, 'round', base.districtId, type, Math.floor(timeMin / 60)) < raw - whole ? 1 : 0;
      const n = whole + extra;
      if (n <= 0) continue;
      const key = `${type}:${activity}`;
      const cur = groups.get(key);
      if (cur) cur.count += n;
      else groups.set(key, { type, activity, count: n });
    }
  }
}
