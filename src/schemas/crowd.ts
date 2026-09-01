/**
 * Cheap crowd layer: typed counts plus stable pseudo-agents. A CrowdAgent is
 * not a full NPC; its crowdId is stable for the whole trip or presence and is
 * the handle the engine passes to instantiate() when the player interacts.
 */

export type Activity =
  | 'sleeping'
  | 'home'
  | 'working'
  | 'commuting'
  | 'shopping'
  | 'leisure'
  | 'transit_wait';

/** id required for every kind except city. */
export interface CrowdScope {
  kind: 'city' | 'district' | 'edge' | 'stop' | 'parcel';
  id?: string;
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
  | { kind: 'line'; id: string };
