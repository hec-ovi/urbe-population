/**
 * Crowd handle codec. Edge and stop handles name one trip of a slot (one
 * traversal, one wait); parcel handles name a filled on-duty job slot, so they
 * resolve to a determinate person.
 */

export type CrowdHandle =
  | { kind: 'edge' | 'stop'; id: string; slot: number; trip: number }
  | { kind: 'parcel'; id: string; slot: number };

export function tripHandle(kind: 'edge' | 'stop', id: string, slot: number, trip: number): string {
  return `c|${kind}|${id}|${slot}|${trip}`;
}

export function parcelHandle(parcelId: string, slot: number): string {
  return `c|parcel|${parcelId}|${slot}`;
}

export function parseHandle(crowdId: string): CrowdHandle | undefined {
  const parts = crowdId.split('|');
  if (parts[0] !== 'c') return undefined;
  if ((parts[1] === 'edge' || parts[1] === 'stop') && parts.length === 5) {
    return { kind: parts[1], id: parts[2]!, slot: Number(parts[3]), trip: Number(parts[4]) };
  }
  if (parts[1] === 'parcel' && parts.length === 4) {
    return { kind: 'parcel', id: parts[2]!, slot: Number(parts[3]) };
  }
  return undefined;
}
