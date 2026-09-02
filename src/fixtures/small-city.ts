/**
 * Standalone fixture: three districts (downtown, residential, industrial with
 * zero residents), one workplace of every staffed parcel type, a bus line and
 * one interior NpcSupport (the cafe). Sized so every job slot is filled
 * (residential capacity exceeds jobs), which keeps vendor queries total.
 * Used by tests and the 2D testbed.
 */

import type { CityBlueprint, Parcel, ParcelType, Polygon, Vec2, WealthTier } from '../schemas/blueprint.js';
import type { NpcSupport } from '../schemas/interiors.js';

function square(x: number, z: number, w: number, d: number): Polygon {
  return [
    [x, z],
    [x + w, z],
    [x + w, z + d],
    [x, z + d],
  ];
}

function parcel(
  id: string,
  districtId: string,
  type: ParcelType,
  tier: WealthTier,
  at: [number, number, number, number],
  edgeId: string,
  access: Vec2,
  floors: [number, number],
): Parcel {
  return {
    id,
    districtId,
    type,
    tier,
    footprint: square(...at),
    access: { edgeId, point: access },
    envelope: { minFloors: floors[0], maxFloors: floors[1], floorHeight: 3 },
  };
}

const ZERO_COUNTS: Record<ParcelType, number> = {
  residential: 0, hotel: 0, offices: 0, corpo: 0, hospital: 0, clinic: 0, police: 0,
  military: 0, factory: 0, commerce: 0, mall: 0, restaurant: 0, coffee_shop: 0,
};

export const FIXTURE_BLUEPRINT: CityBlueprint = {
  meta: { version: '0.2', seed: 'fixture' },
  districts: [
    { id: 'd0', kind: 'downtown', tier: 'mid', boundary: square(0, 0, 500, 500), maxFloors: 8 },
    { id: 'd1', kind: 'residential', tier: 'poor', boundary: square(500, 0, 500, 500), maxFloors: 6 },
    { id: 'd2', kind: 'industrial', tier: 'poor', boundary: square(1000, 0, 500, 500), maxFloors: 4 },
  ],
  streets: {
    edges: [
      { id: 'e0', path: [[0, 250], [500, 250]], sidewalk: { left: 2, right: 2 }, districtIds: ['d0'] },
      { id: 'e1', path: [[500, 250], [1000, 250]], sidewalk: { left: 2, right: 2 }, districtIds: ['d1'] },
      { id: 'e2', path: [[250, 0], [250, 500]], sidewalk: { left: 1.5, right: 1.5 }, districtIds: ['d0'] },
      { id: 'e3', path: [[750, 0], [750, 500]], sidewalk: { left: 1.5, right: 1.5 }, districtIds: ['d1'] },
      { id: 'e4', path: [[1000, 250], [1500, 250]], sidewalk: { left: 1.5, right: 1.5 }, districtIds: ['d2'] },
      { id: 'e5', path: [[500, 450], [1000, 450]], sidewalk: { left: 1.5, right: 1.5 }, districtIds: ['d1'] },
      { id: 'e_deck', path: [[0, 50], [1500, 50]], sidewalk: { left: 0, right: 0 }, districtIds: ['d0', 'd1', 'd2'] },
    ],
  },
  parcels: [
    parcel('p_r0', 'd0', 'residential', 'mid', [100, 300, 30, 30], 'e0', [110, 250], [2, 4]),
    parcel('p_r1', 'd1', 'residential', 'poor', [550, 300, 30, 30], 'e1', [560, 250], [4, 6]),
    parcel('p_r2', 'd1', 'residential', 'poor', [650, 300, 30, 30], 'e1', [660, 250], [4, 6]),
    parcel('p_r3', 'd1', 'residential', 'poor', [850, 300, 30, 30], 'e1', [860, 250], [4, 6]),
    parcel('p_r4', 'd1', 'residential', 'poor', [950, 300, 30, 30], 'e1', [960, 250], [4, 6]),
    parcel('p_cafe', 'd0', 'coffee_shop', 'mid', [300, 260, 10, 8], 'e0', [305, 250], [1, 1]),
    parcel('p_office', 'd0', 'offices', 'mid', [150, 100, 10, 10], 'e2', [250, 105], [2, 2]),
    parcel('p_rest', 'd0', 'restaurant', 'mid', [350, 200, 12, 10], 'e0', [355, 250], [1, 1]),
    parcel('p_police', 'd1', 'police', 'poor', [700, 100, 15, 15], 'e3', [750, 105], [1, 2]),
    parcel('p_shop', 'd1', 'commerce', 'poor', [800, 200, 15, 15], 'e1', [805, 250], [1, 2]),
    parcel('p_factory', 'd2', 'factory', 'poor', [1100, 300, 30, 20], 'e4', [1110, 250], [1, 2]),
    parcel('p_hotel', 'd0', 'hotel', 'mid', [400, 100, 20, 20], 'e2', [250, 110], [2, 3]),
    parcel('p_clinic', 'd0', 'clinic', 'mid', [50, 400, 15, 15], 'e2', [250, 405], [1, 2]),
    parcel('p_corpo', 'd0', 'corpo', 'mid', [200, 50, 15, 15], 'e2', [250, 55], [2, 3]),
    parcel('p_mall', 'd1', 'mall', 'poor', [600, 100, 25, 25], 'e3', [750, 115], [1, 2]),
    parcel('p_hospital', 'd1', 'hospital', 'poor', [850, 100, 20, 20], 'e3', [750, 120], [1, 2]),
    parcel('p_base', 'd2', 'military', 'poor', [1200, 100, 25, 25], 'e4', [1200, 250], [1, 2]),
  ],
  transit: {
    busStops: [
      { id: 'b0', edgeId: 'e0', position: [400, 250], districtId: 'd0' },
      { id: 'b1', edgeId: 'e1', position: [600, 250], districtId: 'd1' },
      { id: 'b2', edgeId: 'e1', position: [900, 250], districtId: 'd1' },
    ],
    busRoutes: [{ id: 'r0', stopIds: ['b0', 'b1', 'b2'] }],
    trainStations: [],
    trainLines: [],
    subwayStations: [],
    subwayLines: [],
  },
  stats: {
    population: 0,
    parcelCounts: {
      ...ZERO_COUNTS,
      residential: 5, coffee_shop: 1, offices: 1, restaurant: 1, police: 1, commerce: 1, factory: 1,
      hotel: 1, clinic: 1, corpo: 1, mall: 1, hospital: 1, military: 1,
    },
    perDistrict: [],
  },
};

export const FIXTURE_CAFE_SUPPORT: NpcSupport = {
  buildingId: 'p_cafe',
  anchors: [
    { id: 'a_door', floor: 0, room: 'room0', kind: 'entrance', position: [305, 261], facingDeg: 180 },
    { id: 'a_counter', floor: 0, room: 'room0', kind: 'counter_spot', position: [303, 264], facingDeg: 180 },
    { id: 'a_machine', floor: 0, room: 'room0', kind: 'machine_spot', position: [301, 266], facingDeg: 90 },
    { id: 'a_seat', floor: 0, room: 'room0', kind: 'seat', position: [307, 265], facingDeg: 0 },
  ],
  roles: [{ id: 'r_barista', role: 'barista', floor: 0, homeAnchor: 'a_counter', count: [1, 2] }],
  routines: [
    {
      role: 'r_barista',
      steps: [
        { anchor: 'a_counter', minutes: [10, 20], animation: 'work_serve' },
        { anchor: 'a_machine', minutes: [5, 10], animation: 'work_cook' },
      ],
    },
  ],
  nav: {
    cellSize: 1,
    floors: [{ floor: 0, origin: [300, 260], cols: 10, rows: 8, walkable: '//////////8=' }],
    connectors: [],
  },
};

export const FIXTURE_INTERIORS: Record<string, NpcSupport> = { p_cafe: FIXTURE_CAFE_SUPPORT };
