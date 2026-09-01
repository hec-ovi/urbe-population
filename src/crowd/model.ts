/**
 * Cheap crowd layer: closed-form typed counts per scope and time, plus a
 * deterministic capped sample of pseudo-agents for every scope kind, each
 * carrying an instantiation handle. Query cost is independent of population
 * and of edge count when sampling is off (maxAgents 0). District group tables
 * are memoized per timestamp and per-edge counts use a string-free hash, so
 * the sampled path stays flat on large cities.
 * Street presence of worker categories follows the work district (commute
 * peaks around shifts, from the ACS departure curve); residents follow home.
 */

import { hash01, mix01, rand, streamKey } from '../core/rng.js';
import { dayOf, minuteOfDay } from '../core/time.js';
import { shiftCoversTime } from '../population/jobs.js';
import { edgeHandle, parcelHandle, parseHandle } from './handles.js';
import { SimulationError } from '../schemas/errors.js';
import type { AssignmentModel } from '../population/assignment.js';
import type { WorldModel, CrowdEdge } from '../world/model.js';
import type { ResolvedParams } from '../population/defaults.js';
import type { NPCTypeSet, NPCCategory } from '../schemas/npc-types.js';
import type { PopulationStats } from '../schemas/population.js';
import type { Activity, CrowdAgent, CrowdGroup, CrowdOpts, CrowdScope, CrowdSlice } from '../schemas/crowd.js';

interface DistrictCrowdBase {
  districtId: string;
  /** Resident-side counts (home district). */
  typeCounts: Record<string, number>;
  /** Worker-side counts (work district), filled job slots only. */
  workTypeCounts: Record<string, number>;
  edges: CrowdEdge[];
  edgeLengthTotal: number;
}

interface DistrictGroups {
  t: number;
  groups: CrowdGroup[];
  total: number;
}

type Curve = [number, number][];

const DEFAULT_MAX_AGENTS = 64;
const STOP_PERIOD_MIN = 8;

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
  private readonly edgeIndex = new Map<string, number>();
  private readonly groupsCache = new Map<string, DistrictGroups>();
  private readonly fastKey: number;

  constructor(
    private readonly seed: string | number,
    private readonly world: WorldModel,
    stats: PopulationStats,
    typeSet: NPCTypeSet,
    private readonly params: ResolvedParams,
    private readonly assignment: AssignmentModel,
  ) {
    this.fastKey = streamKey(seed, 'crowd');
    for (const t of typeSet.types) this.categoryByType.set(t.type, t.category);
    world.crowdEdges.forEach((e, i) => this.edgeIndex.set(e.id, i));
    for (const d of stats.perDistrict) {
      const typeCounts: Record<string, number> = {};
      for (const tier of Object.values(d.byTier)) {
        for (const [type, n] of Object.entries(tier.typeCounts)) typeCounts[type] = (typeCounts[type] ?? 0) + n;
      }
      const edges = world.crowdEdges.filter((e) => e.districtId === d.districtId);
      this.districts.set(d.districtId, {
        districtId: d.districtId,
        typeCounts,
        workTypeCounts: {},
        edges,
        edgeLengthTotal: edges.reduce((s, e) => s + e.lengthM, 0),
      });
    }
    for (const wp of world.workplaces) {
      const base = this.districts.get(wp.districtId);
      if (!base) continue;
      for (let local = 0; local < wp.staffing.slotCount; local++) {
        const adultIdx = assignment.adultOfSlot(wp.slotOffset + local);
        if (adultIdx === undefined) continue;
        const type = assignment.typeOfAdult(adultIdx).type;
        base.workTypeCounts[type] = (base.workTypeCounts[type] ?? 0) + 1;
      }
    }
  }

  crowd(timeMin: number, scope: CrowdScope, opts?: CrowdOpts): CrowdSlice {
    if (!Number.isFinite(timeMin) || timeMin < 0) throw new SimulationError('E_TIME', `invalid time ${timeMin}`);
    const maxAgents = opts?.maxAgents ?? DEFAULT_MAX_AGENTS;
    switch (scope.kind) {
      case 'city': {
        const merged = new Map<string, CrowdGroup>();
        for (const base of this.districts.values()) mergeInto(merged, this.districtGroupsAt(base, timeMin).groups);
        return { timeMin, scope, groups: [...merged.values()], agents: this.edgeSample(this.world.crowdEdges, timeMin, maxAgents) };
      }
      case 'district': {
        const base = this.districts.get(scope.id ?? '');
        if (!base) throw new SimulationError('E_UNKNOWN_ID', `no district ${scope.id}`);
        const { groups } = this.districtGroupsAt(base, timeMin);
        return { timeMin, scope, groups, agents: this.edgeSample(base.edges, timeMin, maxAgents) };
      }
      case 'edge': {
        const edge = this.edgeById(scope.id ?? '');
        if (!edge) throw new SimulationError('E_UNKNOWN_ID', `no walk edge ${scope.id}`);
        return { timeMin, scope, groups: this.edgeGroups(edge, timeMin), agents: this.edgeSample([edge], timeMin, maxAgents) };
      }
      case 'stop': {
        const stop = this.world.stopsById.get(scope.id ?? '');
        if (!stop) throw new SimulationError('E_UNKNOWN_ID', `no stop ${scope.id}`);
        const groups = this.stopGroups(scope.id!, timeMin);
        const total = groups.reduce((s, g) => s + g.count, 0);
        const agents: CrowdAgent[] = [];
        const epoch = Math.floor(timeMin / STOP_PERIOD_MIN);
        for (let slot = 0; slot < Math.min(total, maxAgents); slot++) {
          agents.push(this.stopAgent(scope.id!, slot, epoch, groups));
        }
        return { timeMin, scope, groups, agents };
      }
      case 'parcel': {
        const wp = this.world.workplacesByParcel.get(scope.id ?? '');
        if (!wp && !this.world.parcelsById.has(scope.id ?? '')) {
          throw new SimulationError('E_UNKNOWN_ID', `no parcel ${scope.id}`);
        }
        const groups = new Map<string, CrowdGroup>();
        const agents: CrowdAgent[] = [];
        if (wp) {
          for (let local = 0; local < wp.staffing.slotCount; local++) {
            const globalSlot = wp.slotOffset + local;
            const adultIdx = this.assignment.adultOfSlot(globalSlot);
            if (adultIdx === undefined) continue;
            if (!shiftCoversTime(this.assignment.jobOfSlot(globalSlot).shift, timeMin)) continue;
            const type = this.assignment.typeOfAdult(adultIdx).type;
            const key = `${type}:working`;
            const cur = groups.get(key);
            if (cur) cur.count += 1;
            else groups.set(key, { type, activity: 'working', count: 1 });
            if (agents.length < maxAgents) {
              agents.push({
                crowdId: parcelHandle(wp.parcelId, local),
                type,
                activity: 'working',
                place: { kind: 'parcel', id: wp.parcelId },
                progress: 0,
                direction: 1,
              });
            }
          }
        }
        return { timeMin, scope, groups: [...groups.values()], agents };
      }
    }
  }

  /** Recompute the agent a crowdId names at a time; undefined when it is not alive then. */
  agentAt(crowdId: string, timeMin: number): CrowdAgent | undefined {
    const h = parseHandle(crowdId);
    if (!h) return undefined;
    if (h.kind === 'edge') {
      const edge = this.edgeById(h.id);
      if (!edge) return undefined;
      if (Math.floor(timeMin / this.edgePeriod(edge)) !== h.epoch) return undefined;
      const base = this.districts.get(edge.districtId);
      if (!base) return undefined;
      const dg = this.districtGroupsAt(base, timeMin);
      if (h.slot >= this.edgeCount(edge, base, dg.total, timeMin)) return undefined;
      return this.edgeAgent(edge, h.slot, h.epoch, timeMin, dg.groups);
    }
    if (h.kind === 'stop') {
      if (!this.world.stopsById.has(h.id)) return undefined;
      if (Math.floor(timeMin / STOP_PERIOD_MIN) !== h.epoch) return undefined;
      const groups = this.stopGroups(h.id, timeMin);
      if (h.slot >= groups.reduce((s, g) => s + g.count, 0)) return undefined;
      return this.stopAgent(h.id, h.slot, h.epoch, groups);
    }
    const wp = this.world.workplacesByParcel.get(h.id);
    if (!wp || h.slot >= wp.staffing.slotCount) return undefined;
    const globalSlot = wp.slotOffset + h.slot;
    const adultIdx = this.assignment.adultOfSlot(globalSlot);
    if (adultIdx === undefined) return undefined;
    if (!shiftCoversTime(this.assignment.jobOfSlot(globalSlot).shift, timeMin)) return undefined;
    return {
      crowdId,
      type: this.assignment.typeOfAdult(adultIdx).type,
      activity: 'working',
      place: { kind: 'parcel', id: h.id },
      progress: 0,
      direction: 1,
    };
  }

  private edgeById(id: string): CrowdEdge | undefined {
    const i = this.edgeIndex.get(id);
    return i === undefined ? undefined : this.world.crowdEdges[i];
  }

  /** District group table, memoized per timestamp (the engine polls one t across scopes). */
  private districtGroupsAt(base: DistrictCrowdBase, timeMin: number): DistrictGroups {
    const cached = this.groupsCache.get(base.districtId);
    if (cached && cached.t === timeMin) return cached;
    const map = new Map<string, CrowdGroup>();
    this.accumulate(map, base, timeMin, 1);
    const groups = [...map.values()];
    const entry: DistrictGroups = { t: timeMin, groups, total: groups.reduce((s, g) => s + g.count, 0) };
    this.groupsCache.set(base.districtId, entry);
    return entry;
  }

  private edgePeriod(edge: CrowdEdge): number {
    return Math.max(2, Math.round(edge.lengthM / 80));
  }

  /** Deterministic pedestrian count on one edge: district total scaled by length share. */
  private edgeCount(edge: CrowdEdge, base: DistrictCrowdBase, districtTotal: number, timeMin: number): number {
    if (base.edgeLengthTotal <= 0) return 0;
    const raw = (districtTotal * edge.lengthM) / base.edgeLengthTotal;
    const whole = Math.floor(raw);
    const extra = mix01(this.fastKey, this.edgeIndex.get(edge.id) ?? 0, Math.floor(timeMin / 60), 7) < raw - whole ? 1 : 0;
    return whole + extra;
  }

  /** Edge-scope display counts: district groups scaled to the edge's share. */
  private edgeGroups(edge: CrowdEdge, timeMin: number): CrowdGroup[] {
    const base = this.districts.get(edge.districtId);
    if (!base || base.edgeLengthTotal <= 0) return [];
    const share = edge.lengthM / base.edgeLengthTotal;
    const edgeIdx = this.edgeIndex.get(edge.id) ?? 0;
    const out: CrowdGroup[] = [];
    const dg = this.districtGroupsAt(base, timeMin);
    dg.groups.forEach((g, gi) => {
      const raw = g.count * share;
      const whole = Math.floor(raw);
      const extra = mix01(this.fastKey, edgeIdx, Math.floor(timeMin / 60), gi) < raw - whole ? 1 : 0;
      const n = whole + extra;
      if (n > 0) out.push({ type: g.type, activity: g.activity, count: n });
    });
    return out;
  }

  private edgeAgent(edge: CrowdEdge, slot: number, epoch: number, timeMin: number, groups: CrowdGroup[]): CrowdAgent {
    const crowdId = edgeHandle('edge', edge.id, slot, epoch);
    const r = rand(this.seed, 'agent', crowdId);
    const g = groups[r.weighted(groups.map((x) => x.count))]!;
    const phase = r.next();
    return {
      crowdId,
      type: g.type,
      activity: g.activity,
      place: { kind: 'edge', id: edge.id },
      progress: (timeMin / this.edgePeriod(edge) + phase) % 1,
      direction: r.next() < 0.5 ? 1 : -1,
    };
  }

  /** Deterministic sample across edges, proportional to their counts. */
  private edgeSample(edges: CrowdEdge[], timeMin: number, maxAgents: number): CrowdAgent[] {
    if (maxAgents <= 0 || edges.length === 0) return [];
    let totalAll = 0;
    const counts = new Array<number>(edges.length);
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i]!;
      const base = this.districts.get(edge.districtId);
      if (!base) {
        counts[i] = 0;
        continue;
      }
      const dg = this.districtGroupsAt(base, timeMin);
      counts[i] = this.edgeCount(edge, base, dg.total, timeMin);
      totalAll += counts[i]!;
    }
    if (totalAll === 0) return [];
    const agents: CrowdAgent[] = [];
    for (let i = 0; i < edges.length && agents.length < maxAgents; i++) {
      const total = counts[i]!;
      if (total === 0) continue;
      const edge = edges[i]!;
      const quota = Math.min(total, Math.max(1, Math.round((maxAgents * total) / totalAll)), maxAgents - agents.length);
      const epoch = Math.floor(timeMin / this.edgePeriod(edge));
      const groups = this.districtGroupsAt(this.districts.get(edge.districtId)!, timeMin).groups;
      for (let slot = 0; slot < quota; slot++) agents.push(this.edgeAgent(edge, slot, epoch, timeMin, groups));
    }
    return agents;
  }

  private stopGroups(stopId: string, timeMin: number): CrowdGroup[] {
    const districtId = this.world.districtAt(this.world.stopsById.get(stopId)!.position);
    const base = this.districts.get(districtId);
    const groups = new Map<string, CrowdGroup>();
    if (base) this.accumulate(groups, base, timeMin, 0.05, 'transit_wait');
    return [...groups.values()];
  }

  private stopAgent(stopId: string, slot: number, epoch: number, groups: CrowdGroup[]): CrowdAgent {
    const crowdId = edgeHandle('stop', stopId, slot, epoch);
    const r = rand(this.seed, 'agent', crowdId);
    const g = groups[r.weighted(groups.map((x) => x.count))]!;
    return {
      crowdId,
      type: g.type,
      activity: 'transit_wait',
      place: { kind: 'stop', id: stopId },
      progress: 0,
      direction: 1,
    };
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
    const add = (type: string, count: number, fraction: number, activity: Activity): void => {
      const raw = count * fraction * this.params.crowdScale * share;
      const whole = Math.floor(raw);
      const extra = hash01(this.seed, 'round', base.districtId, type, activity, Math.floor(timeMin / 60)) < raw - whole ? 1 : 0;
      const n = whole + extra;
      if (n <= 0) return;
      const key = `${type}:${activity}`;
      const cur = groups.get(key);
      if (cur) cur.count += n;
      else groups.set(key, { type, activity, count: n });
    };
    for (const [type, count] of Object.entries(base.typeCounts)) {
      const category = this.categoryByType.get(type) ?? 'resident';
      if (category === 'street') {
        add(type, count, curveAt(STREET_OUT, m), forceActivity ?? 'leisure');
      } else if (category === 'resident') {
        const fraction = curveAt(RESIDENT_OUT, m) * (weekend ? 1.2 : 1);
        add(type, count, fraction, forceActivity ?? (m >= 540 && m < 900 ? 'shopping' : 'leisure'));
      }
    }
    for (const [type, count] of Object.entries(base.workTypeCounts)) {
      const fraction = weekend ? curveAt(RESIDENT_OUT, m) : curveAt(WORKER_COMMUTE, m);
      add(type, count, fraction, forceActivity ?? (m >= 660 && m < 840 ? 'leisure' : 'commuting'));
    }
  }
}

function mergeInto(target: Map<string, CrowdGroup>, groups: CrowdGroup[]): void {
  for (const g of groups) {
    const key = `${g.type}:${g.activity}`;
    const cur = target.get(key);
    if (cur) cur.count += g.count;
    else target.set(key, { type: g.type, activity: g.activity, count: g.count });
  }
}
