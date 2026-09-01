/** Pure-arithmetic 2D helpers (no implementation-approximated Math calls). */

import type { Polygon, Polyline, Vec2 } from '../schemas/blueprint.js';

export function polygonArea(poly: Polygon): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i]!;
    const [x2, z2] = poly[(i + 1) % poly.length]!;
    sum += x1 * z2 - x2 * z1;
  }
  return Math.abs(sum) / 2;
}

export function polylineLength(path: Polyline): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    const [x1, z1] = path[i - 1]!;
    const [x2, z2] = path[i]!;
    len += Math.sqrt((x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1));
  }
  return len;
}

export function dist2(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0];
  const dz = a[1] - b[1];
  return dx * dx + dz * dz;
}

export function midpoint(path: Polyline): Vec2 {
  const a = path[0]!;
  const b = path[path.length - 1]!;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** Ray-cast point-in-polygon. */
export function pointInPolygon(p: Vec2, poly: Polygon): boolean {
  let inside = false;
  const [px, pz] = p;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
