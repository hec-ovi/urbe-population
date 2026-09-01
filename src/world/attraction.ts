/**
 * Land-use pull along a street. Pedestrian volumes track what fronts the
 * pavement: a block of shops and cafes carries several times the walkers of a
 * block of warehouses, so street presence is spread by pull, not by plain
 * length. Parcel doors are bucketed into a grid once at build time; a street
 * point reads the doors within a block of it.
 */

import { dist2 } from './geo.js';
import { PULL_RADIUS_M, STREET_PULL_BY_TYPE } from '../population/defaults.js';
import type { Parcel, Vec2 } from '../schemas/blueprint.js';

/** How often the pull is read along a street, meters. */
const SAMPLE_STEP_M = 40;

interface Door {
  point: Vec2;
  pull: number;
}

export class AttractionField {
  private readonly cells = new Map<string, Door[]>();
  private readonly radius2 = PULL_RADIUS_M * PULL_RADIUS_M;

  constructor(parcels: Parcel[]) {
    for (const p of parcels) {
      const pull = STREET_PULL_BY_TYPE[p.type];
      if (!pull) continue;
      const door = { point: p.access.point, pull };
      const key = this.key(door.point);
      const cell = this.cells.get(key);
      if (cell) cell.push(door);
      else this.cells.set(key, [door]);
    }
  }

  /** Mean pull along a street: sampled every SAMPLE_STEP_M so long edges are read whole. */
  along(path: Vec2[]): number {
    let sum = 0;
    let samples = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const steps = Math.max(1, Math.round(Math.sqrt(dist2(a, b)) / SAMPLE_STEP_M));
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        sum += this.at([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        samples++;
      }
    }
    return samples === 0 ? 1 : sum / samples;
  }

  /** Pull multiplier at a street point: 1 for a bare street, more with doors on it. */
  at(point: Vec2): number {
    const cx = Math.floor(point[0] / PULL_RADIUS_M);
    const cz = Math.floor(point[1] / PULL_RADIUS_M);
    let sum = 1;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cell = this.cells.get(`${cx + dx},${cz + dz}`);
        if (!cell) continue;
        for (const door of cell) if (dist2(point, door.point) <= this.radius2) sum += door.pull;
      }
    }
    return sum;
  }

  private key(point: Vec2): string {
    return `${Math.floor(point[0] / PULL_RADIUS_M)},${Math.floor(point[1] / PULL_RADIUS_M)}`;
  }
}
