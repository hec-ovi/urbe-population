/**
 * Consumed slice of the atlas city blueprint.
 * Mirrors ../atlas/schema/blueprint.ts (verified against the v0.14 base shape and the
 * additive v0.15 hydrology shape):
 * identical names and field shapes, narrowed to what simulation reads, so a
 * full atlas blueprint satisfies it. Street class and level, street nodes and
 * crossings, station geometry, and hydrology are the host's business, not the
 * population's, and stay out.
 * Units meters, ground plane XZ, 2D points [x, z], polygons CCW.
 */

export type Vec2 = [x: number, z: number];
export type Polygon = Vec2[];
export type Polyline = Vec2[];

export type DistrictKind = 'downtown' | 'commercial' | 'residential' | 'industrial' | 'mixed';
export type WealthTier = 'poor' | 'mid' | 'rich' | 'high_rich';

export type ParcelType =
  | 'residential'
  | 'hotel'
  | 'offices'
  | 'corpo'
  | 'hospital'
  | 'clinic'
  | 'police'
  | 'military'
  | 'factory'
  | 'commerce'
  | 'mall'
  | 'restaurant'
  | 'coffee_shop';

export interface CityBlueprint {
  meta: { version: string; seed: string };
  districts: District[];
  streets: { edges: StreetEdge[] };
  parcels: Parcel[];
  transit: Transit;
  stats: CityStats;
}

export interface District {
  id: string;
  kind: DistrictKind;
  /** Dominant wealth tier; individual parcels may differ. */
  tier: WealthTier;
  boundary: Polygon;
  maxFloors: number;
}

export interface StreetEdge {
  id: string;
  /** Centerline polyline; crowd positions interpolate along it. */
  path: Polyline;
  /** Sidewalk width per side in meters, 0 = none (no pedestrians on that side). */
  sidewalk: { left: number; right: number };
  districtIds: string[];
}

export interface Parcel {
  id: string;
  districtId: string;
  type: ParcelType;
  tier: WealthTier;
  footprint: Polygon;
  /** Street access: the entrance connects to this edge's sidewalk at this point. */
  access: { edgeId: string; point: Vec2 };
  envelope: Envelope;
}

export interface Envelope {
  minFloors: number;
  maxFloors: number;
  /** Typical floor height for the type/tier, meters. */
  floorHeight: number;
}

export interface Transit {
  busStops: BusStop[];
  busRoutes: BusRoute[];
  trainStations: Station[];
  trainLines: RailLine[];
  subwayStations: Station[];
  subwayLines: RailLine[];
}

export interface BusStop {
  id: string;
  edgeId: string;
  position: Vec2;
  districtId: string;
}

export interface BusRoute {
  id: string;
  /** Ordered stops served. */
  stopIds: string[];
}

export interface Station {
  id: string;
  position: Vec2;
  districtId: string;
}

export interface RailLine {
  id: string;
  /** Ordered stations served. */
  stationIds: string[];
}

export interface CityStats {
  /** Estimated residents from residential capacity; simulation scales to it. */
  population: number;
  parcelCounts: Record<ParcelType, number>;
  perDistrict: DistrictStats[];
}

export interface DistrictStats {
  districtId: string;
  population: number;
  parcelCounts: Record<ParcelType, number>;
}
