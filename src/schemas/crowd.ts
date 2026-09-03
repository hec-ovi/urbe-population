/**
 * Cheap crowd layer: typed counts plus pseudo-agents for every scope kind. A
 * CrowdAgent is not a full NPC; its crowdId names one trip (a traversal of a
 * street edge, a wait at a stop, an on-duty span at a parcel) and is the
 * handle the engine passes to instantiate() when the player interacts.
 * Groups carry the exact counts. City, district, edge, stop and parcel
 * scopes return a sample of agents capped by CrowdOpts.maxAgents; a radius
 * scope returns every street and stop agent inside its circle.
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
  /** Handle naming this agent's trip: the same id at every minute of the trip, instantiable throughout, bound to its person once instantiated. */
  crowdId: string;
  /** Whole minutes the handle is alive, startMin to endMin inclusive. */
  trip: TripSpan;
  type: string;
  /** The gender the crowdId resolves to on instantiation. */
  gender: Gender;
  /** Stable body seed retained if this handle becomes a named NPC. */
  appearanceSeed: number;
  activity: Activity;
  place: PlaceRef;
  /** 0..1 along the edge path when place is an edge: runs 0 to 1 over the trip for direction 1, 1 to 0 for direction -1. */
  progress: number;
  /** Travel direction along the edge path. */
  direction: 1 | -1;
}

export interface TripSpan {
  startMin: number;
  /** Last whole minute of the trip; the handle instantiates at it and is stale after it. */
  endMin: number;
}

export type PlaceRef =
  | { kind: 'edge'; id: string }
  | { kind: 'stop'; id: string }
  | { kind: 'parcel'; id: string }
  | { kind: 'route'; id: string };
