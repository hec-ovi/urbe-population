/**
 * Plain shapes the UI renders. No library type crosses this line, so views and
 * widgets never import simulation internals.
 */

export type Point = [x: number, y: number];

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Static geometry of the city: everything drawn once per frame. */
export interface Scene {
  bounds: Bounds;
  districts: SceneDistrict[];
  streets: SceneStreet[];
  parcels: SceneParcel[];
  stops: ScenePoint[];
  /** Distinct parcel types present, for the legend. */
  parcelTypes: string[];
}

export interface SceneDistrict {
  id: string;
  kind: string;
  boundary: Point[];
}

export interface SceneStreet {
  id: string;
  path: Point[];
}

export interface SceneParcel {
  id: string;
  type: string;
  footprint: Point[];
  bounds: Bounds;
  /** True when the place has workers, so clicking it asks for the one on duty. */
  staffed: boolean;
}

export interface ScenePoint {
  id: string;
  position: Point;
}

/** One walking pseudo-agent placed on the map at a given minute. */
export interface CrowdDot {
  id: string;
  position: Point;
  activity: string;
}

export interface NpcSummary {
  npcId: string;
  name: PersonName;
  gender: string;
  type: string;
  home: { parcelId: string; unit: number };
  job: JobSummary | null;
  family: FamilySummary[];
  commutes: CommuteSummary[];
}

export interface PersonName {
  given: string;
  family: string;
}

export interface JobSummary {
  parcelId: string;
  role: string;
  shift: { kind: string; startMin: number; endMin: number; days: number[] };
}

export interface FamilySummary {
  relation: string;
  name: PersonName;
  instantiated: boolean;
}

export interface CommuteSummary {
  day: number;
  startMin: number;
  routeId: string;
  boardStopId: string;
  alightStopId: string;
}

export interface BehaviorSummary {
  activity: string;
  mode: string;
  place: { kind: string; id: string };
  interior?: InteriorSummary;
  interrupted: boolean;
}

export type InteriorSummary =
  | { kind: 'at'; anchorId: string; animation: string }
  | { kind: 'walk'; fromAnchorId: string; toAnchorId: string };

/** The whole simulation surface the testbed UI is allowed to use. */
export interface CityFeed {
  /** Minute range the time control spans (one week). */
  timeRange: { min: number; max: number };
  scene(): Scene;
  dots(timeMin: number): CrowdDot[];
  /** Instantiates the NPC behind a crowd dot. Throws Error with a readable message. */
  instantiateDot(dotId: string, timeMin: number): NpcSummary;
  /** The worker on duty at a place. Throws Error with a readable message. */
  vendorAt(parcelId: string, timeMin: number): NpcSummary;
  /** Null when the NPC is dead or unknown at that minute. */
  behavior(npcId: string, timeMin: number): BehaviorSummary | null;
}
