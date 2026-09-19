/**
 * What kind of place a building is, which decides its hours, the counter
 * service it keeps and how many guests it seats: service venues
 * run through the evening and the night, office venues keep office hours and
 * a watch while they are closed, round-the-clock venues never shut. A
 * building whose Interior publishes counter service is a service venue
 * whatever the blueprint calls it, so a furnished restaurant keeps restaurant
 * hours even when its parcel is typed as an office.
 */

import { ALL_DAYS, OPENING_BY_TYPE, type OpeningProfile } from './defaults.js';
import { DERIVED_ROLE } from './role-types.js';
import type { ParcelType } from '../schemas/blueprint.js';
import type { NpcSupport } from '../schemas/interiors.js';

export type VenueModel = 'service' | 'office' | 'round_clock' | 'industrial';

const H = 60;

/** Interior roles that serve guests over a counter or a table. */
const SERVICE_ROLES = new Set(['vendor', 'waiter', 'cook', 'barista']);

/** Interior roles that occupy a venue instead of working it. */
const GUEST_ROLES = new Set(['guest', 'resident']);

/** Hours a building keeps when Interior serves guests there but its parcel type does not. */
const SERVICE_HOURS: OpeningProfile = {
  venue: 'service',
  open: 11 * H,
  close: 24 * H,
  allDay: false,
  days: ALL_DAYS,
  model: 'rota',
  nightOnlyChance: 0,
};

/** Seats one member of the counter service covers. */
const SEATS_PER_SERVER = 16;

/** Square meters of venue floor per guest seat, for a venue Interior has not furnished. */
const AREA_PER_SEAT: Partial<Record<ParcelType, number>> = {
  restaurant: 4,
  coffee_shop: 4,
  hotel: 12,
  commerce: 8,
  mall: 10,
};

export function isGuestRole(role: string): boolean {
  return GUEST_ROLES.has(role);
}

export function isServiceRole(role: string): boolean {
  return SERVICE_ROLES.has(role);
}

/**
 * The counter service a venue keeps whatever else it is staffed with: one
 * post per handful of seats, so a furnished restaurant that publishes only a
 * cleaner still has waiters at its tables.
 */
export function serviceCrew(parcelType: ParcelType, seats: number): string[] {
  const role = DERIVED_ROLE[parcelType] ?? 'vendor';
  return new Array<string>(Math.max(1, Math.round(seats / SEATS_PER_SERVER))).fill(role);
}

/** Whether the Interior staffs this building with counter service. */
function servesGuests(support?: NpcSupport): boolean {
  return support?.roles.some((slot) => SERVICE_ROLES.has(slot.role) && slot.count[1] > 0) ?? false;
}

/** The hours a parcel keeps, and the venue model that shapes its rota. */
export function openingOf(parcelType: ParcelType, support?: NpcSupport): OpeningProfile | undefined {
  const profile = OPENING_BY_TYPE[parcelType];
  if (profile?.venue === 'service' || profile?.venue === 'round_clock') return profile;
  return servesGuests(support) ? SERVICE_HOURS : profile;
}

/**
 * Seats a venue offers its guests: the Interior's own seats and guest slots,
 * else what its floor area holds. Zero where guests have nothing to sit on.
 */
export function seatsOf(parcelType: ParcelType, floorArea: number, support?: NpcSupport): number {
  if (support) {
    const seats =
      support.anchors.filter((a) => a.kind === 'seat').length +
      support.roles.filter((slot) => isGuestRole(slot.role)).reduce((sum, slot) => sum + slot.count[1], 0);
    if (seats > 0) return seats;
  }
  const perSeat = AREA_PER_SEAT[parcelType];
  return perSeat ? Math.max(1, Math.round(floorArea / perSeat)) : 0;
}
