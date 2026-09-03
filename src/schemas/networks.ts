/**
 * Consumed slice of ../connections/schemas/networks.schema.json: the walk
 * graph crowds move on and the timetabled transit routines ride. Road lanes,
 * signals and air corridors are host concerns and not read here; a full
 * connections Networks object satisfies this slice.
 * Units meters, [x, z] ground plane; transit times in seconds from midnight.
 */

import type { Vec2 } from './blueprint.js';

export type Vec3 = [x: number, y: number, z: number];

export interface Networks {
  walk: WalkNet;
  transit: { routes: TransitRoute[] };
}

export interface WalkNet {
  nodes: WalkNode[];
  edges: WalkEdge[];
}

export interface WalkNode {
  id: string;
  x: number;
  y: number;
  z: number;
  kind:
    | 'sidewalk'
    | 'corner'
    | 'crossing-end'
    | 'stop'
    | 'station'
    | 'station-entrance'
    | 'station-access'
    | 'station-handoff'
    | 'entry'
    | 'link-portal';
  /** Stop, station, parcel or link id this node serves, by kind. */
  ref?: string;
}

export interface WalkEdge {
  id: string;
  from: string;
  to: string;
  kind: 'sidewalk' | 'crossing' | 'access' | 'stairs' | 'passage' | 'platform' | 'link';
  width: number;
  /** Compatibility projection only. Movement always uses path3. */
  path: Vec2[];
  /** Connections' authoritative walking surface. */
  path3: Vec3[];
}

export interface TransitRoute {
  id: string;
  kind: 'bus' | 'subway' | 'train';
  /** Atlas transit line id. */
  lineId: string;
  /** Ordered stops with distance along the route shape. */
  stops: RouteStop[];
  /** One entry per stop; seconds from trip start. */
  template: { arrive: number; depart: number }[];
  /** Departures at start + phase + k * headway, seconds from midnight. */
  service: ServiceWindow[];
}

export interface RouteStop {
  stopId: string;
  x: number;
  y: number;
  z: number;
  shapeDist: number;
}

export interface ServiceWindow {
  start: number;
  end: number;
  headway: number;
  phase: number;
}
