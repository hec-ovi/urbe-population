/**
 * Cheap crowd layer: closed-form typed counts per scope and time, plus
 * pseudo-agents carrying trip handles. City, district, edge, stop and parcel
 * scopes hand back a deterministic sample capped by maxAgents; a radius scope
 * hands back every street and stop agent inside its circle. Street and stop
 * agents are trips (trips.ts): a slot's trip starts at a fixed minute, is
 * typed from the district mix at that minute and lives one period, so the
 * same handle comes back on every poll until the walker leaves the edge.
 * Query cost is independent of population and of edge count when sampling is
 * off (maxAgents 0). District tables are memoized per minute, per-edge
 * counts use a string-free hash and a grid indexes edges by position, so the
 * sampled and radius paths stay flat on large cities.
 * Who is outside and when comes from presence.ts; where they are comes from
 * land-use pull: workers show up around their workplace, errand and leisure
 * trips land in the districts and on the streets that draw people, and the
 * neighbourhood's own traffic stays home.
 */

import { hash01, mix01, rand, streamKey } from '../core/rng.js';
import { dayOf, minuteOfDay } from '../core/time.js';
import { shiftSpanAt } from '../population/jobs.js';
import { dist2, pointAlong } from '../world/geo.js';
import { EdgeGrid } from './edge-grid.js';
import { parcelHandle, parseHandle, tripHandle } from './handles.js';
import { MinuteMemo } from './minute-memo.js';
import { TripSchedule, type Trip } from './trips.js';
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
import type { Activity, CrowdAgent, CrowdGroup, CrowdOpts, CrowdScope, CrowdSlice, TripSpan } from '../schemas/crowd.js';

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
  groups: CrowdGroup[];
  total: number;
}

const DEFAULT_MAX_AGENTS = 64;
/** One wait at a stop. */
const STOP_WAIT_MIN = 8;
/** Walking pace that sets an edge's traversal time. */
const WALK_M_PER_MIN = 80;
/** Minutes of tables kept per district: longer than any trip period. */
const MEMO_MINUTES = 256;

export class CrowdModel {
  private readonly districts = new Map<string, DistrictCrowdBase>();
  private readonly categoryByType = new Map<string, NPCCategory>();
  private readonly edgeIndex = new Map<string, number>();
  private readonly edgeTrips: TripSchedule[];
  private readonly stopTrips = new TripSchedule(STOP_WAIT_MIN);
  private readonly stopDistrict = new Map<string, string>();
  private readonly grid: EdgeGrid;
  private readonly groupsMemo = new MinuteMemo<DistrictGroups>(MEMO_MINUTES);
  private readonly stopGroupsMemo = new MinuteMemo<CrowdGroup[]>(MEMO_MINUTES);
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
    this.edgeTrips = world.crowdEdges.map((e) => new TripSchedule(Math.max(2, Math.round(e.lengthM / WALK_M_PER_MIN))));
    for (const s of world.stops) this.stopDistrict.set(s.id, world.districtAt(s.position));
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
        return this.slice(timeMin, scope, this.edgeAgents(edge, timeMin), maxAgents);
      }
      case 'stop': {
        if (!this.world.stopsById.has(id)) throw new SimulationError('E_UNKNOWN_ID', `no stop ${id}`);
        return this.slice(timeMin, scope, this.stopAgents(id, timeMin), maxAgents);
      }
      case 'parcel': {
        const wp = this.world.workplacesByParcel.get(id);
        if (!wp && !this.world.parcelsById.has(id)) throw new SimulationError('E_UNKNOWN_ID', `no parcel ${id}`);
        const agents: CrowdAgent[] = [];
        for (let local = 0; wp && local < wp.staffing.slotCount; local++) {
          const agent = this.parcelAgent(wp, local, timeMin);
          if (agent) agents.push(agent);
        }
        return this.slice(timeMin, scope, agents, maxAgents);
      }
    }
  }

  /** Recompute the agent a crowdId names at a time; undefined when its trip does not cover it. */
  agentAt(crowdId: string, timeMin: number): CrowdAgent | undefined {
    const h = parseHandle(crowdId);
    if (!h) return undefined;
    if (h.kind === 'edge') {
      const edge = this.edgeById(h.id);
      const base = edge && this.districts.get(edge.districtId);
      if (!edge || !base) return undefined;
      const trip = this.schedule(edge).at(h.slot, h.trip, timeMin, (start) => this.edgeCountAt(edge, base, start));
      return trip ? this.edgeAgent(edge, base, trip, timeMin) : undefined;
    }
    if (h.kind === 'stop') {
      if (!this.world.stopsById.has(h.id)) return undefined;
      const trip = this.stopTrips.at(h.slot, h.trip, timeMin, (start) => this.stopCountAt(h.id, start));
      return trip ? this.stopAgent(h.id, trip) : undefined;
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
      for (const agent of this.edgeAgents(edge, timeMin)) {
        if (dist2(pointAlong(edge.path, agent.progress), centre) <= r2) agents.push(agent);
      }
    }
    for (const stop of this.world.stops) {
      if (dist2(stop.position, centre) <= r2) agents.push(...this.stopAgents(stop.id, timeMin));
    }
    return this.slice(timeMin, scope, agents, Infinity);
  }

  /** Groups tallied from the whole agent set, the list capped. */
  private slice(timeMin: number, scope: CrowdScope, agents: CrowdAgent[], maxAgents: number): CrowdSlice {
    const groups = new Map<string, CrowdGroup>();
    for (const agent of agents) tally(groups, agent.type, agent.activity, 1);
    return { timeMin, scope, groups: [...groups.values()], agents: agents.slice(0, maxAgents) };
  }

  private edgeById(id: string): CrowdEdge | undefined {
    const i = this.edgeIndex.get(id);
    return i === undefined ? undefined : this.world.crowdEdges[i];
  }

  private schedule(edge: CrowdEdge): TripSchedule {
    return this.edgeTrips[this.edgeIndex.get(edge.id)!]!;
  }

  /** District group table at a minute, memoized: trip starts and polls revisit the same minutes. */
  private districtGroupsAt(base: DistrictCrowdBase, timeMin: number): DistrictGroups {
    return this.groupsMemo.get(base.districtId, timeMin, () => {
      const map = new Map<string, CrowdGroup>();
      this.accumulate(map, base, timeMin, 1);
      const groups = [...map.values()];
      return { groups, total: groups.reduce((s, g) => s + g.count, 0) };
    });
  }

  /** Pedestrian count on one edge at a minute: district total scaled by the edge's share, rounded per hour. */
  private edgeCountAt(edge: CrowdEdge, base: DistrictCrowdBase, timeMin: number): number {
    if (base.edgeWeightTotal <= 0) return 0;
    const raw = (this.districtGroupsAt(base, timeMin).total * edge.weight) / base.edgeWeightTotal;
    const whole = Math.floor(raw);
    const extra = mix01(this.fastKey, this.edgeIndex.get(edge.id) ?? 0, Math.floor(timeMin / 60), 7) < raw - whole ? 1 : 0;
    return whole + extra;
  }

  private edgeAliveCount(edge: CrowdEdge, timeMin: number): number {
    const base = this.districts.get(edge.districtId);
    return base ? this.schedule(edge).aliveCount(timeMin, (start) => this.edgeCountAt(edge, base, start)) : 0;
  }

  /** Trips in flight on an edge, materialized up to `limit` agents in slot order. */
  private edgeAgents(edge: CrowdEdge, timeMin: number, limit = Infinity): CrowdAgent[] {
    const base = this.districts.get(edge.districtId);
    if (!base) return [];
    const trips = this.schedule(edge).alive(timeMin, (start) => this.edgeCountAt(edge, base, start));
    return trips.slice(0, limit).map((trip) => this.edgeAgent(edge, base, trip, timeMin));
  }

  private edgeAgent(edge: CrowdEdge, base: DistrictCrowdBase, trip: Trip, timeMin: number): CrowdAgent {
    const crowdId = tripHandle('edge', edge.id, trip.slot, trip.trip);
    const r = rand(this.seed, 'agent', crowdId);
    const groups = this.districtGroupsAt(base, trip.startMin).groups;
    const g = groups[r.weighted(groups.map((x) => x.count))]!;
    const gender = this.genders.draw(r);
    const direction = r.next() < 0.5 ? 1 : -1;
    const walked = (timeMin - trip.startMin) / this.schedule(edge).period;
    return {
      crowdId,
      trip: span(trip),
      type: g.type,
      gender,
      activity: g.activity,
      place: { kind: 'edge', id: edge.id },
      progress: direction === 1 ? walked : 1 - walked,
      direction,
    };
  }

  /** Deterministic sample across edges, proportional to their trips in flight. */
  private edgeSample(edges: CrowdEdge[], timeMin: number, maxAgents: number): CrowdAgent[] {
    if (maxAgents <= 0 || edges.length === 0) return [];
    const counts = edges.map((edge) => this.edgeAliveCount(edge, timeMin));
    const totalAll = counts.reduce((s, n) => s + n, 0);
    if (totalAll === 0) return [];
    const agents: CrowdAgent[] = [];
    for (let i = 0; i < edges.length && agents.length < maxAgents; i++) {
      const total = counts[i]!;
      if (total === 0) continue;
      const quota = Math.min(total, Math.max(1, Math.round((maxAgents * total) / totalAll)), maxAgents - agents.length);
      agents.push(...this.edgeAgents(edges[i]!, timeMin, quota));
    }
    return agents;
  }

  /** Waiting groups at a stop: its district's presence at the transit-wait share, memoized per minute. */
  private stopGroupsAt(stopId: string, timeMin: number): CrowdGroup[] {
    const districtId = this.stopDistrict.get(stopId)!;
    return this.stopGroupsMemo.get(districtId, timeMin, () => {
      const base = this.districts.get(districtId);
      const groups = new Map<string, CrowdGroup>();
      if (base) this.accumulate(groups, base, timeMin, TRANSIT_WAIT_SHARE, 'transit_wait');
      return [...groups.values()];
    });
  }

  private stopCountAt(stopId: string, timeMin: number): number {
    return this.stopGroupsAt(stopId, timeMin).reduce((s, g) => s + g.count, 0);
  }

  private stopAgents(stopId: string, timeMin: number): CrowdAgent[] {
    return this.stopTrips.alive(timeMin, (start) => this.stopCountAt(stopId, start)).map((trip) => this.stopAgent(stopId, trip));
  }

  private stopAgent(stopId: string, trip: Trip): CrowdAgent {
    const crowdId = tripHandle('stop', stopId, trip.slot, trip.trip);
    const r = rand(this.seed, 'agent', crowdId);
    const groups = this.stopGroupsAt(stopId, trip.startMin);
    const g = groups[r.weighted(groups.map((x) => x.count))]!;
    return {
      crowdId,
      trip: span(trip),
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
    const trip = shiftSpanAt(this.assignment.jobOfSlot(globalSlot).shift, timeMin);
    if (!trip) return undefined;
    return {
      crowdId: parcelHandle(wp.parcelId, local),
      trip,
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

function span(trip: Trip): TripSpan {
  return { startMin: trip.startMin, endMin: trip.endMin };
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
