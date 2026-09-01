/**
 * WorldModel: indexes blueprint, networks and interiors into the structures
 * the population, crowd and instancing layers read. Built once per simulation.
 */

import { polygonArea, polylineLength, midpoint, pointInPolygon, dist2 } from './geo.js';
import { AttractionField } from './attraction.js';
import { hash01 } from '../core/rng.js';
import { staffWorkplace, type WorkplaceStaffing } from '../population/jobs.js';
import { UNIT_AREA_BY_TIER } from '../population/defaults.js';
import type { ResolvedParams } from '../population/defaults.js';
import type { CityBlueprint, District, Parcel, Vec2, WealthTier } from '../schemas/blueprint.js';
import type { Networks } from '../schemas/networks.js';
import type { NpcSupport } from '../schemas/interiors.js';

export interface ResidentialBlock {
  parcelId: string;
  units: number;
  unitOffset: number;
}

/** Residential parcels of one district and tier: the demographic grouping unit. */
export interface Group {
  index: number;
  districtId: string;
  tier: WealthTier;
  blocks: ResidentialBlock[];
  totalUnits: number;
}

export interface Workplace {
  parcelId: string;
  districtId: string;
  type: Parcel['type'];
  tier: WealthTier;
  staffing: WorkplaceStaffing;
  slotOffset: number;
}

export interface Stop {
  id: string;
  position: Vec2;
}

export interface ServiceRoute {
  id: string;
  kind: 'bus' | 'train' | 'subway';
  stopIds: string[];
  /** Travel minutes between consecutive stops. */
  legMinutes: number[];
  headwayMin: number;
  serviceStartMin: number;
  serviceEndMin: number;
}

export interface CrowdEdge {
  id: string;
  districtId: string;
  lengthM: number;
  /** Share of the district's street presence this edge draws: length times land-use pull. */
  weight: number;
}

const TIER_ORDER: WealthTier[] = ['poor', 'mid', 'rich', 'high_rich'];
const BUS_M_PER_MIN = 333;
const RAIL_M_PER_MIN = 666;

export class WorldModel {
  readonly districts: District[];
  readonly districtsById = new Map<string, District>();
  readonly parcelsById = new Map<string, Parcel>();
  readonly groups: Group[] = [];
  readonly workplaces: Workplace[] = [];
  readonly workplacesByParcel = new Map<string, Workplace>();
  readonly totalJobSlots: number;
  readonly stops: Stop[] = [];
  readonly stopsById = new Map<string, Stop>();
  readonly routes: ServiceRoute[] = [];
  readonly crowdEdges: CrowdEdge[] = [];
  readonly interiors: Map<string, NpcSupport>;

  constructor(
    readonly seed: string | number,
    readonly blueprint: CityBlueprint,
    networks: Networks | undefined,
    params: ResolvedParams,
    interiors?: Record<string, NpcSupport>,
  ) {
    this.districts = [...blueprint.districts].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const d of this.districts) this.districtsById.set(d.id, d);
    const parcels = [...blueprint.parcels].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const p of parcels) this.parcelsById.set(p.id, p);
    this.interiors = new Map(Object.entries(interiors ?? {}));

    this.buildGroups(parcels);
    this.totalJobSlots = this.buildWorkplaces(parcels);
    if (networks && networks.transit.routes.length > 0) this.buildTransitFromNetworks(networks);
    else this.buildTransitFallback(params.defaultHeadwayMin);
    this.buildCrowdEdges(networks);
  }

  private buildGroups(parcels: Parcel[]): void {
    for (const district of this.districts) {
      for (const tier of TIER_ORDER) {
        const blocks: ResidentialBlock[] = [];
        let offset = 0;
        for (const p of parcels) {
          if (p.districtId !== district.id || p.type !== 'residential' || p.tier !== tier) continue;
          const floors =
            p.envelope.minFloors +
            Math.floor(hash01(this.seed, 'floors', p.id) * (p.envelope.maxFloors - p.envelope.minFloors + 1));
          const perFloor = Math.max(1, Math.floor(polygonArea(p.footprint) / UNIT_AREA_BY_TIER[tier]));
          const units = floors * perFloor;
          blocks.push({ parcelId: p.id, units, unitOffset: offset });
          offset += units;
        }
        if (blocks.length > 0) {
          this.groups.push({ index: this.groups.length, districtId: district.id, tier, blocks, totalUnits: offset });
        }
      }
    }
  }

  private buildWorkplaces(parcels: Parcel[]): number {
    let offset = 0;
    for (const p of parcels) {
      const staffing = staffWorkplace(this.seed, p, polygonArea(p.footprint), this.interiors.get(p.id));
      if (staffing.slotCount === 0) continue;
      const wp: Workplace = { parcelId: p.id, districtId: p.districtId, type: p.type, tier: p.tier, staffing, slotOffset: offset };
      this.workplaces.push(wp);
      this.workplacesByParcel.set(p.id, wp);
      offset += staffing.slotCount;
    }
    return offset;
  }

  private addStop(id: string, position: Vec2): void {
    if (!this.stopsById.has(id)) {
      const stop = { id, position };
      this.stops.push(stop);
      this.stopsById.set(id, stop);
    }
  }

  private buildTransitFromNetworks(networks: Networks): void {
    for (const r of [...networks.transit.routes].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const legMinutes: number[] = [];
      for (let i = 1; i < r.stops.length; i++) {
        const prev = r.template[i - 1];
        const cur = r.template[i];
        legMinutes.push(prev && cur ? Math.max(1, Math.round((cur.arrive - prev.depart) / 60)) : 1);
      }
      const windows = [...r.service].sort((a, b) => a.start - b.start);
      const first = windows[0]!;
      const last = windows[windows.length - 1]!;
      this.routes.push({
        id: r.id,
        kind: r.kind === 'subway' ? 'subway' : r.kind === 'train' ? 'train' : 'bus',
        stopIds: r.stops.map((s) => s.stopId),
        legMinutes,
        headwayMin: Math.max(1, Math.round(first.headway / 60)),
        serviceStartMin: Math.round(first.start / 60),
        serviceEndMin: Math.round(last.end / 60),
      });
      for (const s of r.stops) this.addStop(s.stopId, [s.x, s.z]);
    }
  }

  private buildTransitFallback(headwayMin: number): void {
    const t = this.blueprint.transit;
    const positions = new Map<string, Vec2>();
    for (const s of t.busStops) positions.set(s.id, s.position);
    for (const s of [...t.trainStations, ...t.subwayStations]) positions.set(s.id, s.position);
    const lines: { id: string; kind: ServiceRoute['kind']; stopIds: string[] }[] = [
      ...t.busRoutes.map((r) => ({ id: r.id, kind: 'bus' as const, stopIds: r.stopIds })),
      ...t.trainLines.map((r) => ({ id: r.id, kind: 'train' as const, stopIds: r.stationIds })),
      ...t.subwayLines.map((r) => ({ id: r.id, kind: 'subway' as const, stopIds: r.stationIds })),
    ];
    for (const line of lines.sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const speed = line.kind === 'bus' ? BUS_M_PER_MIN : RAIL_M_PER_MIN;
      const legMinutes: number[] = [];
      let ok = line.stopIds.length >= 2;
      for (let i = 1; i < line.stopIds.length; i++) {
        const a = positions.get(line.stopIds[i - 1]!);
        const b = positions.get(line.stopIds[i]!);
        if (!a || !b) {
          ok = false;
          break;
        }
        legMinutes.push(Math.max(1, Math.ceil(Math.sqrt(dist2(a, b)) / speed)));
      }
      if (!ok) continue;
      this.routes.push({
        id: line.id,
        kind: line.kind,
        stopIds: line.stopIds,
        legMinutes,
        headwayMin,
        serviceStartMin: 5 * 60,
        serviceEndMin: 24 * 60,
      });
      for (const id of line.stopIds) this.addStop(id, positions.get(id)!);
    }
  }

  private buildCrowdEdges(networks: Networks | undefined): void {
    const pull = new AttractionField(this.blueprint.parcels);
    const add = (id: string, districtId: string, path: Vec2[]): void => {
      const lengthM = polylineLength(path);
      this.crowdEdges.push({ id, districtId, lengthM, weight: lengthM * pull.along(path) });
    };
    if (networks && networks.walk.edges.length > 0) {
      for (const e of networks.walk.edges) {
        if (e.kind !== 'sidewalk' && e.kind !== 'crossing') continue;
        add(e.id, this.districtAt(midpoint(e.path)), e.path);
      }
    } else {
      for (const e of this.blueprint.streets.edges) {
        if (e.sidewalk.left <= 0 && e.sidewalk.right <= 0) continue;
        add(e.id, e.districtIds[0] ?? this.districts[0]!.id, e.path);
      }
    }
  }

  districtAt(point: Vec2): string {
    for (const d of this.districts) if (pointInPolygon(point, d.boundary)) return d.id;
    return this.districts[0]!.id;
  }

  nearestStopId(point: Vec2): string | undefined {
    let best: string | undefined;
    let bestD = Infinity;
    for (const s of this.stops) {
      const d = dist2(point, s.position);
      if (d < bestD) {
        bestD = d;
        best = s.id;
      }
    }
    return best;
  }

  /** Lowest-id route serving boardStop before alightStop, with in-service check left to callers. */
  directRoute(boardStopId: string, alightStopId: string): ServiceRoute | undefined {
    for (const r of this.routes) {
      const a = r.stopIds.indexOf(boardStopId);
      const b = r.stopIds.indexOf(alightStopId);
      if (a >= 0 && b > a) return r;
    }
    return undefined;
  }

  rideMinutes(route: ServiceRoute, boardStopId: string, alightStopId: string): number {
    const a = route.stopIds.indexOf(boardStopId);
    const b = route.stopIds.indexOf(alightStopId);
    let sum = 0;
    for (let i = a; i < b; i++) sum += route.legMinutes[i] ?? 1;
    return sum;
  }
}
