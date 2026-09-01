/**
 * The single seam between the testbed UI and the simulation library: builds a
 * fixture city and hands the UI plain scene, crowd and NPC shapes. No other
 * file under src/ui imports the library.
 */

import {
  createSimulation,
  FIXTURE_BLUEPRINT,
  FIXTURE_INTERIORS,
  SimulationError,
  type BehaviorState,
  type CityBlueprint,
  type NPCInstance,
  type Polyline,
  type Vec2,
} from '../../index.js';
import type {
  BehaviorSummary,
  Bounds,
  CityFeed,
  CrowdDot,
  NpcSummary,
  Point,
  Scene,
  SceneParcel,
} from './types.js';

const WEEK_MINUTES = 7 * 24 * 60;
/** Places with no staff to meet. */
const UNSTAFFED_TYPES = new Set(['residential']);

class FixtureCityFeed implements CityFeed {
  readonly timeRange = { min: 0, max: WEEK_MINUTES - 1 };

  private readonly sim: ReturnType<typeof createSimulation>;
  private cachedScene: Scene | undefined;

  constructor(seed: string, private readonly blueprint: CityBlueprint) {
    this.sim = createSimulation({ seed, blueprint, interiors: FIXTURE_INTERIORS });
  }

  scene(): Scene {
    if (!this.cachedScene) this.cachedScene = this.buildScene();
    return this.cachedScene;
  }

  dots(timeMin: number): CrowdDot[] {
    const out: CrowdDot[] = [];
    for (const edge of this.blueprint.streets.edges) {
      const slice = this.sim.crowd(timeMin, { kind: 'edge', id: edge.id });
      for (const agent of slice.agents) {
        out.push({
          id: agent.crowdId,
          position: alongPath(edge.path, agent.progress),
          activity: agent.activity,
        });
      }
    }
    return out;
  }

  instantiateDot(dotId: string, timeMin: number): NpcSummary {
    return this.guard(() => toNpcSummary(this.sim.instantiate({ crowdId: dotId, timeMin })));
  }

  vendorAt(parcelId: string, timeMin: number): NpcSummary {
    return this.guard(() => toNpcSummary(this.sim.getNPCVendor({ parcelId, timeMin })));
  }

  behavior(npcId: string, timeMin: number): BehaviorSummary | null {
    try {
      return toBehaviorSummary(this.sim.behaviorAt(npcId, timeMin));
    } catch {
      return null;
    }
  }

  private guard<T>(run: () => T): T {
    try {
      return run();
    } catch (err) {
      throw readable(err);
    }
  }

  private buildScene(): Scene {
    const bp = this.blueprint;
    const parcels: SceneParcel[] = bp.parcels.map((p) => {
      const footprint = toPoints(p.footprint);
      return { id: p.id, type: p.type, footprint, bounds: boundsOf(footprint), staffed: !UNSTAFFED_TYPES.has(p.type) };
    });
    const stops = [
      ...bp.transit.busStops,
      ...bp.transit.trainStations,
      ...bp.transit.subwayStations,
    ].map((s) => ({ id: s.id, position: toPoint(s.position) }));

    const districts = bp.districts.map((d) => ({ id: d.id, kind: d.kind, boundary: toPoints(d.boundary) }));
    const streets = bp.streets.edges.map((e) => ({ id: e.id, path: toPoints(e.path) }));
    const every = [
      ...districts.flatMap((d) => d.boundary),
      ...streets.flatMap((s) => s.path),
      ...parcels.flatMap((p) => p.footprint),
      ...stops.map((s) => s.position),
    ];

    return {
      bounds: boundsOf(every),
      districts,
      streets,
      parcels,
      stops,
      parcelTypes: [...new Set(bp.parcels.map((p) => p.type))],
    };
  }
}

/** Testbed city: the bundled fixture, so the UI runs with no other layer present. */
export function createCityFeed(seed = 'testbed'): CityFeed {
  return new FixtureCityFeed(seed, FIXTURE_BLUEPRINT);
}

function toPoint(v: Vec2): Point {
  return [v[0], v[1]];
}

function toPoints(vs: readonly Vec2[]): Point[] {
  return vs.map(toPoint);
}

function boundsOf(points: Point[]): Bounds {
  const first = points[0] ?? ([0, 0] as Point);
  const b: Bounds = { minX: first[0], minY: first[1], maxX: first[0], maxY: first[1] };
  for (const [x, y] of points) {
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
  }
  return b;
}

/** Position at 0..1 of the polyline, by cumulative segment length. */
function alongPath(path: Polyline, t: number): Point {
  const first = path[0];
  if (!first) return [0, 0];
  if (path.length < 2) return toPoint(first);

  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengths.push(len);
    total += len;
  }
  if (total === 0) return toPoint(first);

  let travelled = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i]!;
    if (travelled <= len || i === lengths.length - 1) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const f = len === 0 ? 0 : travelled / len;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    travelled -= len;
  }
  return toPoint(path[path.length - 1]!);
}

function toNpcSummary(npc: NPCInstance): NpcSummary {
  return {
    npcId: npc.npcId,
    name: { given: npc.name.given, family: npc.name.family },
    gender: npc.gender,
    type: npc.type,
    home: { parcelId: npc.home.parcelId, unit: npc.home.unit },
    job: npc.job
      ? {
          parcelId: npc.job.parcelId,
          role: npc.job.role,
          shift: {
            kind: npc.job.shift.kind,
            startMin: npc.job.shift.startMin,
            endMin: npc.job.shift.endMin,
            days: [...npc.job.shift.days],
          },
        }
      : null,
    family: npc.family.map((f) => ({
      relation: f.relation,
      name: { given: f.name.given, family: f.name.family },
      instantiated: f.instantiated,
    })),
    commutes: npc.routine
      .filter((entry) => entry.transitLeg)
      .map((entry) => ({
        day: entry.days[0] ?? 0,
        startMin: entry.startMin,
        routeId: entry.transitLeg!.routeId,
        boardStopId: entry.transitLeg!.boardStopId,
        alightStopId: entry.transitLeg!.alightStopId,
      })),
  };
}

function toBehaviorSummary(state: BehaviorState): BehaviorSummary {
  const base: BehaviorSummary = {
    activity: state.activity,
    mode: state.mode,
    place: { kind: state.place.kind, id: state.place.id },
    interrupted: state.interrupted,
  };
  const inside = state.interior;
  if (!inside) return base;
  if ('at' in inside) {
    return { ...base, interior: { kind: 'at', anchorId: inside.at.anchorId, animation: inside.at.animation } };
  }
  return {
    ...base,
    interior: { kind: 'walk', fromAnchorId: inside.walk.fromAnchorId, toAnchorId: inside.walk.toAnchorId },
  };
}

function readable(err: unknown): Error {
  if (err instanceof SimulationError) return new Error(`${err.code}: ${err.message}`);
  return err instanceof Error ? err : new Error(String(err));
}
