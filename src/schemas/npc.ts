/**
 * Full NPC instance: the deterministic life assigned at interaction time and
 * persistent from then on. Behavior state per time for instanced NPCs.
 */

import type { Activity, PlaceRef } from './crowd.js';
import type { InteriorAnimation } from './interiors.js';

export interface NPCName {
  given: string;
  family: string;
}

/** What the host renders as a body. Drawn against the sex ratio per NPC. */
export type Gender = 'male' | 'female';

export interface NPCInstance {
  npcId: string;
  name: NPCName;
  gender: Gender;
  type: string;
  home: { parcelId: string; unit: number };
  job?: Job;
  family: FamilyMember[];
  /** Weekly plan; entries cover the full week with no gaps. */
  routine: RoutineEntry[];
  flags: NPCFlags;
}

export interface Job {
  parcelId: string;
  /** Interior role name when the building has an NpcSupport, else a type-derived role string. */
  role: string;
  shift: Shift;
}

export interface Shift {
  /** Minute of day; endMin < startMin spans midnight. */
  startMin: number;
  endMin: number;
  /** Work days, 0 = Monday. */
  days: number[];
  kind: 'day' | 'evening' | 'night' | 'rotating';
}

export interface FamilyMember {
  npcId: string;
  relation: 'partner' | 'child' | 'parent' | 'sibling' | 'roommate';
  name: NPCName;
  /** False for stubs; pass npcId to instantiate() for the full instance. */
  instantiated: boolean;
}

export interface RoutineEntry {
  /** Days this entry applies, 0 = Monday. */
  days: number[];
  startMin: number;
  endMin: number;
  activity: Activity;
  place: PlaceRef;
  /** Present when the entry is a transit ride. */
  transitLeg?: TransitLeg;
}

export interface TransitLeg {
  /** Connections transit route id. */
  routeId: string;
  boardStopId: string;
  alightStopId: string;
}

export interface NPCFlags {
  dead: boolean;
  custom: string[];
}

export type FlagOp =
  | { kind: 'resign' }
  | { kind: 'promote'; toParcelId?: string }
  | { kind: 'die' }
  | { kind: 'custom'; tag: string };

export interface BehaviorState {
  mode: 'interior' | 'street' | 'transit' | 'home';
  activity: Activity;
  place: PlaceRef;
  /** Present in interior mode: current routine step or walk intent between anchors. */
  interior?: InteriorBehavior;
  interrupted: boolean;
}

export type InteriorBehavior =
  | { at: { anchorId: string; animation: InteriorAnimation; untilMin: number } }
  | { walk: { fromAnchorId: string; toAnchorId: string } };

/** Finds the on-duty worker for a place, type or role at a time. */
export interface VendorQuery {
  parcelId?: string;
  type?: string;
  role?: string;
  timeMin: number;
}

/** Query over already-instanced NPCs. */
export interface NPCQuery {
  type?: string;
  districtId?: string;
  parcelId?: string;
  flag?: string;
  includeDead?: boolean;
}

/** Quest layer reservation: pre-instanced NPC with fixed identity. */
export interface ReservedSpec {
  name: NPCName;
  /** Absent: taken from the pool's tag for the given name, else either. */
  gender?: Gender;
  type: string;
  homeDistrictId?: string;
  jobParcelId?: string;
  role?: string;
}
