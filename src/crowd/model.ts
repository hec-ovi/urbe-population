/**
 * Cheap crowd layer: closed-form typed counts per scope and time, plus
 * pseudo-agents carrying instantiation handles. City, district, edge, stop
 * and parcel scopes hand back a deterministic sample capped by maxAgents; a
 * radius scope hands back every street and stop agent inside its circle.
 * Query cost is independent of population and of edge count when sampling is
 * off (maxAgents 0). District group tables are memoized per timestamp,
 * per-edge counts use a string-free hash and a grid indexes edges by
 * position, so the sampled and radius paths stay flat on large cities.
 * Who is outside and when comes from presence.ts; where they are comes from
 * land-use pull: workers show up around their workplace, errand and leisure
 * trips land in the districts and on the streets that draw people, and the
 * neighbourhood's own traffic stays home.
 */

import { hash01, mix01, rand, streamKey } from '../core/rng.js';
import { dayOf, minuteOfDay } from '../core/time.js';
import { shiftCoversTime } from '../population/jobs.js';
import { dist2, pointAlong } from '../world/geo.js';
import { EdgeGrid } from './edge-grid.js';
import { edgeHandle, parcelHandle, parseHandle } from './handles.js';
import {
  COMMUTE_WEEKDAY,
  COMMUTE_WEEKEND,
  ERRAND_WEEKDAY,
  ERRAND_WEEKEND,
  LOCAL_PRESENCE,
  STREET_REGULAR,
  TRANSIT_WAIT_SHARE,
  WEEKEND_LOCAL_FACTOR,
  curveAt,
} from './presence.js';
import { adultId } from '../instancing/ids.js';
import { SimulationError } from '../schemas/errors.js';
import type { AssignmentModel } from '../population/assignment.js';
import type { GenderResolver } from '../instancing/gender.js';
import type { WorldModel, CrowdEdge, Workplace } from '../world/model.js';
import type { ResolvedParams } from '../population/defaults.js';
import type { NPCTypeSet, NPCCategory } from '../schemas/npc-types.js';
import type { PopulationStats } from '../schemas/population.js';
import type { Vec2 } from '../schemas/blueprint.js';
import type { Activity, CrowdAgent, CrowdGroup, CrowdOpts, CrowdScope, CrowdSlice } from '../schemas/crowd.js';

type RadiusScope = Extract<CrowdScope, { kind: 'radius' }>;

interface DistrictCrowdBase {
  districtId: string;
  /** Residents by type (home district), kids folded in pro rata. */
  residentTypes: Record<string, number>;
  /** Street-category people by type (home district). */
  streetTypes: Record<string, number>;
  /** Worker-side counts (work district), filled job slots only. */
  workTypeCounts: Record<string, number>;
  edges: CrowdEdge[];
  edgeWeightTotal: number;
  /** Share of the city's street pull, so errand and leisure trips land here. */
  pullShare: number;
}

interface DistrictGroups {
  t: number;
  groups: CrowdGroup[];
  total: number;
}

const DEFAULT_MAX_AGENTS = 64;
const STOP_PERIOD_MIN = 8;

export class CrowdModel {
  private readonly districts = new Map<string, DistrictCrowdBase>();
  private readonly categoryByType = new Map<string, NPCCategory>();
  private readonly edgeIndex = new Map<string, number>();
  private readonly grid: EdgeGrid;
  private readonly groupsCache = new Map<string, DistrictGroups>();
  private readonly fastKey: number;
  /** City-wide pools that move to where the pull is, not where they sleep. */
  private readonly cityResidentTypes: Record<string, number> = {};
  private readonly cityStreetTypes: Record<string, number> = {};

  constructor(
    private readonly seed: string | number,
    private readonly world: WorldModel,
    stats: PopulationStats,
    typeSet: NPCTypeSet,
    private readonly params: ResolvedParams,
    private readonly assignment: AssignmentModel,
    private readonly genders: GenderResolver,
  ) {
    this.fastKey = streamKey(seed, 'crowd');
    for (const t of typeSet.types) this.categoryByType.set(t.type, t.category);
    world.crowdEdges.forEach((e, i) => this.edgeIndex.set(e.id, i));
    this.grid = new EdgeGrid(world.crowdEdges);
    let cityPull = 0;
    for (const d of stats.perDistrict) {
      const residentTypes: Record<string, number> = {};
      const streetTypes: Record<string, number> = {};
      let adults = 0;
      let athome = 0;
      for (const tier of Object.values(d.byTier)) {
        for (const [type, n] of Object.entries(tier.typeCounts)) {
          adults += n;
          const category = this.categoryByType.get(type) ?? 'resident';
          if (category === 'street') streetTypes[type] = (streetTypes[type] ?? 0) + n;
          else if (category === 'resident') residentTypes[type] = (residentTypes[type] ?? 0) + n;
          else continue;
          athome += n;
        }
      }
      // Kids have no job and no type of their own: fold them into the resident
      // mix of their district, so school runs and play count as street life.
      const kids = Math.max(0, d.population - adults);
      if (kids > 0 && athome > 0) {
        const grow = (athome + kids) / athome;
        for (const map of [residentTypes, streetTypes]) {
          for (const type of Object.keys(map)) map[type] = map[type]! * grow;
        }
      }
      const edges = world.crowdEdges.filter((e) => e.districtId === d.districtId);
      const edgeWeightTotal = edges.reduce((s, e) => s + e.weight, 0);
      cityPull += edgeWeightTotal;
      this.districts.set(d.districtId, {
        districtId: d.districtId,
        residentTypes,
        streetTypes,
        workTypeCounts: {},
        edges,
        edgeWeightTotal,
        pullShare: edgeWeightTotal,
      });
      addAll(this.cityResidentTypes, residentTypes);
      addAll(this.cityStreetTypes, streetTypes);
    }
    for (const base of this.districts.values()) base.pullShare = cityPull > 0 ? base.edgeWeightTotal / cityPull : 0;
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
    if (scope.kind === 'radius') return this.radius(timeMin, scope);
    const maxAgents = opts?.maxAgents ?? DEFAULT_MAX_AGENTS;
    const id = scope.id ?? '';
    switch (scope.kind) {
      case 'city': {
        const merged = new Map<string, CrowdGroup>();
        for (const base of this.districts.values()) mergeInto(merged, this.districtGroupsAt(base, timeMin).groups);
        return { timeMin, scope, groups: [...merged.values()], agents: this.edgeSample(this.world.crowdEdges, timeMin, maxAgents) };
      }
      case 'district': {
        const base = this.districts.get(id);
        if (!base) throw new SimulationError('E_UNKNOWN_ID', `no district ${id}`);
        const { groups } = this.districtGroupsAt(base, timeMin);
        return { timeMin, scope, groups, agents: this.edgeSample(base.edges, timeMin, maxAgents) };
      }
      case 'edge': {
        const edge = this.edgeById(id);
        if (!edge) throw new SimulationError('E_UNKNOWN_ID', `no walk edge ${id}`);
        return { timeMin, scope, groups: this.edgeGroups(edge, timeMin), agents: this.edgeSample([edge], timeMin, maxAgents) };
      }
      case 'stop': {
        if (!this.world.stopsById.has(id)) throw new SimulationError('E_UNKNOWN_ID', `no stop ${id}`);
        const groups = this.stopGroups(id, timeMin);
        const total = groups.reduce((s, g) => s + g.count, 0);
        const agents: CrowdAgent[] = [];
        const epoch = Math.floor(timeMin / STOP_PERIOD_MIN);
        for (let slot = 0; slot < Math.min(total, maxAgents); slot++) agents.push(this.stopAgent(id, slot, epoch, groups));
        return { timeMin, scope, groups, agents };
      }
      case 'parcel': {
        const wp = this.world.workplacesByParcel.get(id);
        if (!wp && !this.world.parcelsById.has(id)) throw new SimulationError('E_UNKNOWN_ID', `no parcel ${id}`);
        const groups = new Map<string, CrowdGroup>();
        const agents: CrowdAgent[] = [];
        for (let local = 0; wp && local < wp.staffing.slotCount; local++) {
          const agent = this.parcelAgent(wp, local, timeMin);
          if (!agent) continue;
          tally(groups, agent.type, agent.activity, 1);
          if (agents.length < maxAgents) agents.push(agent);
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
    return this.parcelAgent(wp, h.slot, timeMin);
  }

  /** Every street and stop agent inside the circle: what a player standing at [x, z] sees. */
  private radius(timeMin: number, scope: RadiusScope): CrowdSlice {
    if (!Number.isFinite(scope.x) || !Number.isFinite(scope.z)) {
      throw new SimulationError('E_INVALID_INPUT', 'scope.x, scope.z: must be finite', { field: 'scope.x' });
    }
    if (!Number.isFinite(scope.metres) || !(scope.metres > 0)) {
      throw new SimulationError('E_INVALID_INPUT', 'scope.metres: must be > 0', { field: 'scope.metres' });
    }
    const centre: Vec2 = [scope.x, scope.z];
    const r2 = scope.metres * scope.metres;
    const agents: CrowdAgent[] = [];
    for (const edge of this.grid.near(scope.x, scope.z, scope.metres)) {
      const base = this.districts.get(edge.districtId);
      if (!base) continue;
      const dg = this.districtGroupsAt(base, timeMin);
      const count = this.edgeCount(edge, base, dg.total, timeMin);
      const epoch = Math.floor(timeMin / this.edgePeriod(edge));
      for (let slot = 0; slot < count; slot++) {
        const agent = this.edgeAgent(edge, slot, epoch, timeMin, dg.groups);
        if (dist2(pointAlong(edge.path, agent.progress), centre) <= r2) agents.push(agent);
      }
    }
    const epoch = Math.floor(timeMin / STOP_PERIOD_MIN);
    for (const stop of this.world.stops) {
      if (dist2(stop.position, centre) > r2) continue;
      const groups = this.stopGroups(stop.id, timeMin);
      const total = groups.reduce((s, g) => s + g.count, 0);
      for (let slot = 0; slot < total; slot++) agents.push(this.stopAgent(stop.id, slot, epoch, groups));
    }
    const groups = new Map<string, CrowdGroup>();
    for (const agent of agents) tally(groups, agent.type, agent.activity, 1);
    return { timeMin, scope, groups: [...groups.values()], agents };
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
    if (base.edgeWeightTotal <= 0) return 0;
    const raw = (districtTotal * edge.weight) / base.edgeWeightTotal;
    const whole = Math.floor(raw);
    const extra = mix01(this.fastKey, this.edgeIndex.get(edge.id) ?? 0, Math.floor(timeMin / 60), 7) < raw - whole ? 1 : 0;
    return whole + extra;
  }

  /** Edge-scope display counts: district groups scaled to the edge's share. */
  private edgeGroups(edge: CrowdEdge, timeMin: number): CrowdGroup[] {
    const base = this.districts.get(edge.districtId);
    if (!base || base.edgeWeightTotal <= 0) return [];
    const share = edge.weight / base.edgeWeightTotal;
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
    const direction = r.next() < 0.5 ? 1 : -1;
    return {
      crowdId,
      type: g.type,
      gender: this.genders.draw(r),
      activity: g.activity,
      place: { kind: 'edge', id: edge.id },
      progress: (timeMin / this.edgePeriod(edge) + phase) % 1,
      direction,
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
    if (base) this.accumulate(groups, base, timeMin, TRANSIT_WAIT_SHARE, 'transit_wait');
    return [...groups.values()];
  }

  private stopAgent(stopId: string, slot: number, epoch: number, groups: CrowdGroup[]): CrowdAgent {
    const crowdId = edgeHandle('stop', stopId, slot, epoch);
    const r = rand(this.seed, 'agent', crowdId);
    const g = groups[r.weighted(groups.map((x) => x.count))]!;
    return {
      crowdId,
      type: g.type,
      gender: this.genders.draw(r),
      activity: 'transit_wait',
      place: { kind: 'stop', id: stopId },
      progress: 0,
      direction: 1,
    };
  }

  /** The worker filling a parcel's local slot at a time; undefined when the slot is empty or off shift. */
  private parcelAgent(wp: Workplace, local: number, timeMin: number): CrowdAgent | undefined {
    const globalSlot = wp.slotOffset + local;
    const adultIdx = this.assignment.adultOfSlot(globalSlot);
    if (adultIdx === undefined) return undefined;
    if (!shiftCoversTime(this.assignment.jobOfSlot(globalSlot).shift, timeMin)) return undefined;
    return {
      crowdId: parcelHandle(wp.parcelId, local),
      type: this.assignment.typeOfAdult(adultIdx).type,
      gender: this.genders.of(adultId(adultIdx)),
      activity: 'working',
      place: { kind: 'parcel', id: wp.parcelId },
      progress: 0,
      direction: 1,
    };
  }

  /**
   * Street presence of one district: workers around their shift at the district
   * they work in, residents out on errands wherever the pull is, plus the
   * neighbourhood's own local traffic and its street regulars.
   */
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
      const raw = count * fraction * this.params.streetDensity * share;
      const whole = Math.floor(raw);
      const extra = hash01(this.seed, 'round', base.districtId, type, activity, Math.floor(timeMin / 60)) < raw - whole ? 1 : 0;
      const n = whole + extra;
      if (n > 0) tally(groups, type, activity, n);
    };

    const commute = curveAt(weekend ? COMMUTE_WEEKEND : COMMUTE_WEEKDAY, m);
    for (const [type, count] of Object.entries(base.workTypeCounts)) {
      add(type, count, commute, forceActivity ?? (m >= 660 && m < 840 ? 'leisure' : 'commuting'));
    }

    const errand = curveAt(weekend ? ERRAND_WEEKEND : ERRAND_WEEKDAY, m) * base.pullShare;
    const errandActivity = forceActivity ?? (m >= 540 && m < 1140 ? 'shopping' : 'leisure');
    for (const [type, count] of Object.entries(this.cityResidentTypes)) add(type, count, errand, errandActivity);

    const local = curveAt(LOCAL_PRESENCE, m) * (weekend ? WEEKEND_LOCAL_FACTOR : 1);
    for (const [type, count] of Object.entries(base.residentTypes)) add(type, count, local, forceActivity ?? 'leisure');

    const regulars = curveAt(STREET_REGULAR, m) * base.pullShare;
    for (const [type, count] of Object.entries(this.cityStreetTypes)) add(type, count, regulars, forceActivity ?? 'leisure');
  }
}

function addAll(target: Record<string, number>, source: Record<string, number>): void {
  for (const [type, n] of Object.entries(source)) target[type] = (target[type] ?? 0) + n;
}

function tally(target: Map<string, CrowdGroup>, type: string, activity: Activity, n: number): void {
  const key = `${type}:${activity}`;
  const cur = target.get(key);
  if (cur) cur.count += n;
  else target.set(key, { type, activity, count: n });
}

function mergeInto(target: Map<string, CrowdGroup>, groups: CrowdGroup[]): void {
  for (const g of groups) tally(target, g.type, g.activity, g.count);
}
