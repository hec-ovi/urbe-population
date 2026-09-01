/**
 * Uniform grid over the crowd edges' bounding boxes, so a radius query reads
 * the streets around a point instead of scanning the city.
 */

import type { Vec2 } from '../schemas/blueprint.js';
import type { CrowdEdge } from '../world/model.js';

const CELL_M = 100;

interface Box {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export class EdgeGrid {
  private readonly cells = new Map<string, number[]>();
  private readonly boxes: Box[];
  private readonly extent: Box;

  constructor(private readonly edges: CrowdEdge[]) {
    this.boxes = edges.map((e) => boxOf(e.path));
    this.extent = this.boxes.reduce(union, this.boxes[0] ?? { minX: 0, minZ: 0, maxX: 0, maxZ: 0 });
    this.boxes.forEach((box, i) =>
      this.forEachCell(box, (key) => {
        const cell = this.cells.get(key);
        if (cell) cell.push(i);
        else this.cells.set(key, [i]);
      }),
    );
  }

  /** Edges whose bounding box meets the circle's, in edge order. */
  near(x: number, z: number, metres: number): CrowdEdge[] {
    const query: Box = { minX: x - metres, minZ: z - metres, maxX: x + metres, maxZ: z + metres };
    const hits = new Set<number>();
    this.forEachCell(clamp(query, this.extent), (key) => {
      for (const i of this.cells.get(key) ?? []) if (overlaps(this.boxes[i]!, query)) hits.add(i);
    });
    return [...hits].sort((a, b) => a - b).map((i) => this.edges[i]!);
  }

  private forEachCell(box: Box, visit: (key: string) => void): void {
    const x1 = Math.floor(box.maxX / CELL_M);
    const z1 = Math.floor(box.maxZ / CELL_M);
    for (let cx = Math.floor(box.minX / CELL_M); cx <= x1; cx++) {
      for (let cz = Math.floor(box.minZ / CELL_M); cz <= z1; cz++) visit(`${cx},${cz}`);
    }
  }
}

function boxOf(path: Vec2[]): Box {
  const box: Box = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  for (const [x, z] of path) {
    box.minX = Math.min(box.minX, x);
    box.minZ = Math.min(box.minZ, z);
    box.maxX = Math.max(box.maxX, x);
    box.maxZ = Math.max(box.maxZ, z);
  }
  return box;
}

function union(a: Box, b: Box): Box {
  return { minX: Math.min(a.minX, b.minX), minZ: Math.min(a.minZ, b.minZ), maxX: Math.max(a.maxX, b.maxX), maxZ: Math.max(a.maxZ, b.maxZ) };
}

/** The query box cut down to the indexed extent, so a huge radius visits only real cells. */
function clamp(box: Box, extent: Box): Box {
  return {
    minX: Math.max(box.minX, extent.minX),
    minZ: Math.max(box.minZ, extent.minZ),
    maxX: Math.min(box.maxX, extent.maxX),
    maxZ: Math.min(box.maxZ, extent.maxZ),
  };
}

function overlaps(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}
