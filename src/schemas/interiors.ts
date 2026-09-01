/**
 * TypeScript mirror of ../interior/schemas/npc.schema.json (NpcSupport).
 * Simulation staffs roles within [min, max], picks routine dwell times seeded,
 * and emits anchor-to-anchor walk intents; path geometry over nav stays with
 * the host (interior ships a reference findPath).
 */

export type InteriorRoleName =
  | 'receptionist'
  | 'security'
  | 'vendor'
  | 'barista'
  | 'waiter'
  | 'cook'
  | 'office_worker'
  | 'executive'
  | 'cleaner'
  | 'resident'
  | 'trainer'
  | 'guest';

export type AnchorKind =
  | 'entrance'
  | 'work_spot'
  | 'counter_spot'
  | 'seat'
  | 'idle_spot'
  | 'patrol_point'
  | 'bed'
  | 'toilet'
  | 'machine_spot'
  | 'elevator_wait'
  | 'stair_entry'
  | 'cleaning_spot';

export type InteriorAnimation =
  | 'idle_stand'
  | 'idle_sit'
  | 'idle_lean'
  | 'work_type'
  | 'work_serve'
  | 'work_cook'
  | 'sweep'
  | 'patrol_stand'
  | 'exercise'
  | 'sleep'
  | 'use_toilet';

export interface NpcSupport {
  buildingId: string;
  anchors: InteriorAnchor[];
  roles: InteriorRoleSlot[];
  routines: InteriorRoutine[];
  nav: InteriorNav;
}

export interface InteriorAnchor {
  id: string;
  floor: number;
  room: string;
  kind: AnchorKind;
  position: [number, number];
  facingDeg: number;
  furniture?: string;
}

export interface InteriorRoleSlot {
  id: string;
  role: InteriorRoleName;
  floor: number;
  homeAnchor: string;
  /** Staffing range; simulation decides the actual count within it, seeded. */
  count: [min: number, max: number];
}

export interface InteriorRoutine {
  /** Role id. */
  role: string;
  steps: InteriorStep[];
}

export interface InteriorStep {
  anchor: string;
  /** [min, max] dwell minutes; simulation picks within, seeded. */
  minutes: [min: number, max: number];
  animation: InteriorAnimation;
}

/** Nav data passed through to hosts; simulation does not path over it. */
export interface InteriorNav {
  cellSize: number;
  floors: InteriorNavFloor[];
  connectors: InteriorConnector[];
}

export interface InteriorNavFloor {
  floor: number;
  origin: [number, number];
  cols: number;
  rows: number;
  /** Row-major bitmask, base64; 1 = walkable. */
  walkable: string;
}

export interface InteriorConnector {
  id: string;
  kind: 'stair' | 'elevator';
  floors: number[];
  entryByFloor: Record<string, [number, number]>;
}
