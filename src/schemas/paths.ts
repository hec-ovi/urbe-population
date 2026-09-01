/**
 * Path networks consumed from connections.
 * Fixture schema owned here until connections publishes its own; an adapter
 * absorbs the diff then. Optional input: when absent, a fallback service is
 * derived from blueprint transit with default headways and straight-line legs.
 */

import type { Vec2 } from './blueprint.js';

export interface PathNetworks {
  walk: WalkGraph;
  transit: TransitService;
}

/** Street-level pedestrian graph (sidewalks with crossings already merged). */
export interface WalkGraph {
  nodes: WalkNode[];
  edges: WalkEdge[];
}

export interface WalkNode {
  id: string;
  position: Vec2;
  districtId: string;
}

export interface WalkEdge {
  id: string;
  from: string;
  to: string;
  lengthM: number;
  /** Blueprint street edge this sidewalk segment belongs to, when applicable. */
  streetEdgeId?: string;
}

/** Timetabled service over blueprint stops and lines. */
export interface TransitService {
  lines: ServiceLine[];
}

export interface ServiceLine {
  /** Blueprint bus route or rail line id. */
  lineId: string;
  kind: 'bus' | 'train' | 'subway';
  /** Ordered blueprint stop or station ids. */
  stopIds: string[];
  /** Minutes between departures. */
  headwayMin: number;
  /** First departure, minute of day. */
  serviceStartMin: number;
  /** Last departure, minute of day. */
  serviceEndMin: number;
  /** Travel minutes between consecutive stops; length = stopIds.length - 1. */
  legMinutes: number[];
}
