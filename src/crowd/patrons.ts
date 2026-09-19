/**
 * Guests inside a venue: the people at its tables and counters while it is
 * open, in proportion to its seats. A guest carries a trip handle like a
 * walker on a pavement, so the player can talk to one and it becomes a
 * person, and its visit ends when the handle's trip does.
 */

import { hash01, rand, type Rand } from '../core/rng.js';
import { minuteOfDay } from '../core/time.js';
import { isOpenAt } from '../population/jobs.js';
import { tripHandle } from './handles.js';
import { COUNTER_OCCUPANCY, TABLE_OCCUPANCY, curveAt, type Curve } from './presence.js';
import { TripSchedule, type Trip } from './trips.js';
import type { WorldModel, Workplace } from '../world/model.js';
import type { Activity, CrowdAgent } from '../schemas/crowd.js';
import type { Gender } from '../schemas/npc.js';
import type { ParcelType } from '../schemas/blueprint.js';

/** Minutes one visit lasts, by what the venue serves. */
const VISIT_MIN: Partial<Record<ParcelType, number>> = {
  restaurant: 60,
  coffee_shop: 30,
  hotel: 90,
  commerce: 20,
  mall: 40,
};

const DEFAULT_VISIT_MIN = 30;

/** Venues people walk through with a basket; the rest seat their guests. */
const COUNTER_VENUES = new Set<ParcelType>(['commerce', 'mall']);

interface Venue {
  workplace: Workplace;
  seats: number;
  curve: Curve;
  activity: Activity;
  visits: TripSchedule;
}

/** How a guest is cast: both draws come from the crowd layer's own pools. */
export interface GuestCast {
  type(r: Rand): string;
  gender(r: Rand): Gender;
}

export class PatronModel {
  private readonly venues = new Map<string, Venue>();

  constructor(
    private readonly seed: string | number,
    world: WorldModel,
    private readonly cast: GuestCast,
  ) {
    for (const workplace of world.workplaces) {
      const type = workplace.parcelType;
      if (workplace.venue !== 'service' || !type || workplace.seats <= 0) continue;
      const table = !COUNTER_VENUES.has(type);
      this.venues.set(workplace.place.id, {
        workplace,
        seats: workplace.seats,
        curve: table ? TABLE_OCCUPANCY : COUNTER_OCCUPANCY,
        activity: table ? 'leisure' : 'shopping',
        visits: new TripSchedule(VISIT_MIN[type] ?? DEFAULT_VISIT_MIN),
      });
    }
  }

  /** Every guest inside a parcel at a minute; empty for anything that is not an open venue. */
  agents(parcelId: string, timeMin: number): CrowdAgent[] {
    const venue = this.venues.get(parcelId);
    if (!venue) return [];
    return venue.visits.alive(timeMin, (start) => this.countAt(venue, start)).map((trip) => this.agent(venue, trip));
  }

  /** The guest a handle names, or undefined once the visit is over. */
  agentAt(parcelId: string, slot: number, trip: number, timeMin: number): CrowdAgent | undefined {
    const venue = this.venues.get(parcelId);
    if (!venue) return undefined;
    const visit = venue.visits.at(slot, trip, timeMin, (start) => this.countAt(venue, start));
    return visit ? this.agent(venue, visit) : undefined;
  }

  /** Seats taken at a minute, rounded the same way for every poll of that hour. */
  private countAt(venue: Venue, startMin: number): number {
    if (!isOpenAt(venue.workplace.staffing, startMin)) return 0;
    const raw = venue.seats * curveAt(venue.curve, minuteOfDay(startMin));
    const whole = Math.floor(raw);
    const extra = hash01(this.seed, 'guests', venue.workplace.place.id, Math.floor(startMin / 60)) < raw - whole ? 1 : 0;
    return whole + extra;
  }

  private agent(venue: Venue, visit: Trip): CrowdAgent {
    const crowdId = tripHandle('patron', venue.workplace.place.id, visit.slot, visit.trip);
    const r = rand(this.seed, 'agent', crowdId);
    return {
      crowdId,
      trip: { startMin: visit.startMin, endMin: visit.endMin },
      type: this.cast.type(r),
      gender: this.cast.gender(r),
      appearanceSeed: rand(this.seed, 'appearance', crowdId).int(4294967296),
      activity: venue.activity,
      place: venue.workplace.place,
      progress: 0,
      direction: 1,
    };
  }
}
