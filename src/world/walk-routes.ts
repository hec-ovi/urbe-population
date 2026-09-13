/** Selects deterministic shortest journeys from authoritative network paths. */
import type { Vec2 } from '../schemas/blueprint.js';
import type { Networks, Vec3, WalkEdge, WalkNode } from '../schemas/networks.js';
import type { ScheduledWalk } from '../schemas/npc.js';

export class WalkRoutes {
  private readonly walkNodes = new Map<string, WalkNode>();
  private readonly walkEdges = new Map<string, WalkEdge>();
  private readonly walkAdjacency = new Map<string, { edge: WalkEdge; to: string; direction: 1 | -1; distanceM: number }[]>();

  constructor(networks?: Networks) {
    if (!networks) return;
    for (const node of networks.walk.nodes) {
      this.walkNodes.set(node.id, node);
      this.walkAdjacency.set(node.id, []);
    }
    for (const edge of networks.walk.edges) {
      this.walkEdges.set(edge.id, edge);
      const distanceM = path3Length(edge.path3);
      this.walkAdjacency.get(edge.from)!.push({ edge, to: edge.to, direction: 1, distanceM });
      this.walkAdjacency.get(edge.to)!.push({ edge, to: edge.from, direction: -1, distanceM });
    }
    for (const edges of this.walkAdjacency.values()) edges.sort((a, b) => a.edge.id.localeCompare(b.edge.id) || a.to.localeCompare(b.to));
  }

  /** Shortest deterministic walk over Connections path3, never its flat projection. */
  between(fromPoint: Vec2, toPoint: Vec2, from: ScheduledWalk['from'], to: ScheduledWalk['to']): ScheduledWalk | undefined {
    if (this.walkNodes.size === 0) return undefined;
    const start = this.nodeFor(from, fromPoint);
    const finish = this.nodeFor(to, toPoint);
    if (!start || !finish) return undefined;

    const distances = new Map<string, number>([[start.id, 0]]);
    const previous = new Map<string, { from: string; to: string; edge: WalkEdge; direction: 1 | -1; distanceM: number }>();
    const open = new Set<string>([start.id]);
    const settled = new Set<string>();
    while (open.size > 0) {
      const current = [...open].sort((a, b) => (distances.get(a)! - distances.get(b)!) || a.localeCompare(b))[0]!;
      open.delete(current);
      if (current === finish.id) break;
      if (settled.has(current)) continue;
      settled.add(current);
      for (const leg of this.walkAdjacency.get(current) ?? []) {
        if (settled.has(leg.to)) continue;
        const candidate = distances.get(current)! + leg.distanceM;
        const known = distances.get(leg.to) ?? Infinity;
        const old = previous.get(leg.to);
        if (candidate > known + 1e-9) continue;
        if (Math.abs(candidate - known) <= 1e-9 && old && edgeOrder(leg, old) >= 0) continue;
        distances.set(leg.to, candidate);
        previous.set(leg.to, { from: current, ...leg });
        open.add(leg.to);
      }
    }
    if (!distances.has(finish.id)) return undefined;
    const reverse: { edge: WalkEdge; direction: 1 | -1; distanceM: number; from: string }[] = [];
    let cursor = finish.id;
    while (cursor !== start.id) {
      const leg = previous.get(cursor);
      if (!leg) return undefined;
      reverse.push(leg);
      cursor = leg.from;
    }
    const edges = reverse.reverse().map((leg) => ({
      edgeId: leg.edge.id,
      direction: leg.direction,
      path3: (leg.direction === 1 ? leg.edge.path3 : [...leg.edge.path3].reverse()).map((point) => [...point] as Vec3),
      distanceM: leg.distanceM,
    }));
    return { from, to, edges, totalDistanceM: edges.reduce((sum, edge) => sum + edge.distanceM, 0) };
  }

  private nodeFor(place: ScheduledWalk['from'], point: Vec2): WalkNode | undefined {
    const referred = [...this.walkNodes.values()]
      .filter((node) => node.ref === place.id && (
        (place.kind === 'parcel' && node.kind === 'entry') ||
        (place.kind === 'stop' && (node.kind === 'stop' || node.kind === 'station'))
      ))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (referred) return referred;
    if (place.kind === 'edge') {
      const edge = this.walkEdges.get(place.id);
      if (edge) {
        const a = this.walkNodes.get(edge.from)!;
        const b = this.walkNodes.get(edge.to)!;
        return distanceNode2(a, point) <= distanceNode2(b, point) ? a : b;
      }
    }
    return [...this.walkNodes.values()].reduce<WalkNode | undefined>((best, node) => {
      if (!best) return node;
      const distance = distanceNode2(node, point);
      const bestDistance = distanceNode2(best, point);
      return distance < bestDistance - 1e-9 || (Math.abs(distance - bestDistance) <= 1e-9 && node.id < best.id) ? node : best;
    }, undefined);
  }
}

function path3Length(path: Vec3[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return total;
}

function distanceNode2(node: WalkNode, point: Vec2): number {
  return (node.x - point[0]) ** 2 + (node.z - point[1]) ** 2;
}

function edgeOrder(
  left: { edge: WalkEdge; to: string },
  right: { edge: WalkEdge; to: string },
): number {
  return left.edge.id.localeCompare(right.edge.id) || left.to.localeCompare(right.to);
}
