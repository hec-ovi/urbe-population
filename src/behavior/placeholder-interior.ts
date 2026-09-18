/**
 * Interior intent for a stay in a building Interior did not furnish: the
 * person arrives through the parcel's access point, stays inside, and leaves
 * through it again. The two anchors are synthetic and name the parcel, so a
 * host always has somewhere to put the body.
 */

import type { Activity } from '../schemas/crowd.js';
import type { InteriorAnimation } from '../schemas/interiors.js';
import type { InteriorBehavior, RoutineEntry } from '../schemas/npc.js';

/** Minutes spent on the way in and on the way out of an unfurnished building. */
const EDGE_MIN = 2;

const ANIMATION_BY_ACTIVITY: Partial<Record<Activity, InteriorAnimation>> = {
  sleeping: 'sleep',
  home: 'idle_sit',
  working: 'work_type',
  shopping: 'idle_stand',
  leisure: 'idle_stand',
};

export function entranceAnchor(parcelId: string): string {
  return `placeholder:${parcelId}/entrance`;
}

export function insideAnchor(parcelId: string): string {
  return `placeholder:${parcelId}/inside`;
}

/** Where the stay puts the person at this minute, given the steps around it. */
export function placeholderInterior(
  parcelId: string,
  entry: RoutineEntry,
  neighbours: { previous: RoutineEntry; next: RoutineEntry },
  bounds: { startMin: number; endMin: number },
  timeMin: number,
): InteriorBehavior {
  const entrance = entranceAnchor(parcelId);
  const inside = insideAnchor(parcelId);
  const exit: InteriorBehavior = { walk: { fromAnchorId: inside, toAnchorId: entrance } };
  // A commute leg that names a building is the person on their way out of it.
  if (entry.activity === 'commuting' || entry.activity === 'transit_wait') return exit;
  const edge = Math.min(EDGE_MIN, Math.floor((bounds.endMin - bounds.startMin) / 3));
  const arrives = edge > 0 && !samePlace(neighbours.previous, entry);
  const leaves = edge > 0 && !samePlace(neighbours.next, entry);
  if (arrives && timeMin < bounds.startMin + edge) return { walk: { fromAnchorId: entrance, toAnchorId: inside } };
  if (leaves && timeMin >= bounds.endMin - edge) return exit;
  return {
    at: {
      anchorId: inside,
      animation: ANIMATION_BY_ACTIVITY[entry.activity] ?? 'idle_stand',
      untilMin: leaves ? bounds.endMin - edge : bounds.endMin,
    },
  };
}

function samePlace(a: RoutineEntry, b: RoutineEntry): boolean {
  return a.place.kind === b.place.kind && a.place.id === b.place.id;
}
