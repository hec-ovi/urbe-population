/**
 * Crowd handle codec. Edge, stop and patron handles name one trip of a slot
 * (one traversal, one wait, one visit); post handles name a filled on-duty
 * job slot at a building or a station, so they resolve to a determinate
 * person.
 */

export type TripKind = 'edge' | 'stop' | 'patron';

export type CrowdHandle =
  | { kind: TripKind; id: string; slot: number; trip: number }
  | { kind: 'parcel' | 'station'; id: string; slot: number };

export function tripHandle(kind: TripKind, id: string, slot: number, trip: number): string {
  return `c|${kind}|${id}|${slot}|${trip}`;
}

export function parcelHandle(parcelId: string, slot: number): string {
  return `c|parcel|${parcelId}|${slot}`;
}

/** A station's on-duty post: platform staff and the fare hall. */
export function stationHandle(stopId: string, slot: number): string {
  return `c|station|${stopId}|${slot}`;
}

export function parseHandle(crowdId: string): CrowdHandle | undefined {
  const parts = crowdId.split('|');
  if (parts[0] !== 'c') return undefined;
  if ((parts[1] === 'edge' || parts[1] === 'stop' || parts[1] === 'patron') && parts.length === 5) {
    return { kind: parts[1], id: parts[2]!, slot: Number(parts[3]), trip: Number(parts[4]) };
  }
  if ((parts[1] === 'parcel' || parts[1] === 'station') && parts.length === 4) {
    return { kind: parts[1], id: parts[2]!, slot: Number(parts[3]) };
  }
  return undefined;
}
