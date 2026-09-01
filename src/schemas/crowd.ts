/**
 * Cheap crowd layer: typed counts plus pseudo-agents for every scope kind. A
 * CrowdAgent is not a full NPC; its crowdId is stable for the whole trip or
 * presence and is the handle the engine passes to instantiate() when the
 * player interacts. Groups carry the exact counts. City, district, edge,
 * stop and parcel scopes return a sample of agents capped by
 * CrowdOpts.maxAgents; a radius scope returns every street and stop agent
 * inside its circle.
 */

import type { Gender } from './npc.js';

export type Activity =
  | 'sleeping'
  | 'home'
  | 'working'
  | 'commuting'
  | 'shopping'
  | 'leisure'
  | 'transit_wait';

/**
 * id names the district, walk edge (networks), stop or parcel; city takes
 * none. A radius is a circle on the ground plane: centre [x, z], metres.
 */
export type CrowdScope =
  | { kind: 'city' | 'district' | 'edge' | 'stop' | 'parcel'; id?: string }
  | { kind: 'radius'; x: number; z: number; metres: number };

export interface CrowdOpts {
  /** Cap on the sampled agents of a city, district, edge, stop or parcel scope. Default 64. Radius scopes are never capped. */
  maxAgents?: number;
}

export interface CrowdSlice {
  timeMin: number;
  scope: CrowdScope;
  groups: CrowdGroup[];
  agents: CrowdAgent[];
}

export interface CrowdGroup {
  type: string;
  activity: Activity;
  count: number;
}

export interface CrowdAgent {
  /** Stable instantiable handle for this agent's whole trip or presence. */
  crowdId: string;
  type: string;
  /** The gender the crowdId resolves to on instantiation. */
  gender: Gender;
  activity: Activity;
  place: PlaceRef;
  /** 0..1 along the edge path, when place is an edge. */
  progress: number;
  /** Travel direction along the edge path. */
  direction: 1 | -1;
}

export type PlaceRef =
  | { kind: 'edge'; id: string }
  | { kind: 'stop'; id: string }
  | { kind: 'parcel'; id: string }
  | { kind: 'route'; id: string };
