/**
 * Job slots per workplace as a rota: which posts are on duty at once, how
 * many shift waves tile the span they cover, and how many day crews cover its
 * week. Every slot is one (post, wave, crew), so an open venue's slots cover
 * its opening hours on every day it opens and every post it keeps is manned
 * at every one of those hours. An office venue carries a second rota, the
 * watch, over the hours the building is closed.
 */

import { hash01, rand } from '../core/rng.js';
import { MIN_PER_DAY } from '../core/time.js';
import {
  ALL_DAYS,
  AREA_PER_WORKER,
  DESK_SHIFT_MIN,
  MAX_SHIFT_MIN,
  NIGHT_ONLY_HOURS,
  WORK_DAYS_PER_WEEK,
  type OpeningProfile,
} from './defaults.js';
import { DERIVED_ROLE } from './role-types.js';
import { isGuestRole, isServiceRole, openingOf, serviceCrew } from './venues.js';
import type { Parcel } from '../schemas/blueprint.js';
import type { NpcSupport } from '../schemas/interiors.js';
import type { Shift } from '../schemas/npc.js';

/** Named posts on duty at once, tiled by shift waves and covered by day crews. */
export interface Rota {
  /** The role of each post, in post order. */
  postRoles: string[];
  waves: number;
  crews: number;
  shiftLenMin: number;
  /** Minute of day the first wave starts. */
  startMin: number;
  days: number[];
  /** postRoles.length * waves * crews. */
  slotCount: number;
}

export interface WorkplaceStaffing {
  /** The rota that serves while the place is open. */
  open: Rota;
  /** The rota that watches the building through the hours it is closed. */
  watch?: Rota;
  /** Minute of day the place closes; equal to the open rota's start when it never does. */
  closeMin: number;
  /** Every slot of both rotas: the watch first, then the open rota. */
  slotCount: number;
}

const EMPTY_ROTA: Rota = { postRoles: [], waves: 0, crews: 0, shiftLenMin: 0, startMin: 0, days: [], slotCount: 0 };
const EMPTY: WorkplaceStaffing = { open: EMPTY_ROTA, closeMin: 0, slotCount: 0 };

/** Share of a round-the-clock venue's posts that watch doors and cameras. */
const SECURITY_SHARE = 0.2;

export interface ShiftSpan {
  startMin: number;
  endMin: number;
}

/** The on-duty span [startMin, endMin) in absolute minutes that contains a time, midnight spans included. */
export function shiftSpanAt(shift: Shift, timeMin: number): ShiftSpan | undefined {
  const day = Math.floor(timeMin / MIN_PER_DAY) % 7;
  const m = ((timeMin % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  const dayStart = timeMin - m;
  const { startMin, endMin, days } = shift;
  if (startMin === endMin) return days.includes(day) ? { startMin: dayStart, endMin: dayStart + MIN_PER_DAY } : undefined;
  if (startMin < endMin) {
    const on = days.includes(day) && m >= startMin && m < endMin;
    return on ? { startMin: dayStart + startMin, endMin: dayStart + endMin } : undefined;
  }
  if (m >= startMin) return days.includes(day) ? { startMin: dayStart + startMin, endMin: dayStart + MIN_PER_DAY + endMin } : undefined;
  if (m < endMin && days.includes((day + 6) % 7)) return { startMin: dayStart - MIN_PER_DAY + startMin, endMin: dayStart + endMin };
  return undefined;
}

/** Whether a shift covers an absolute time. */
export function shiftCoversTime(shift: Shift, timeMin: number): boolean {
  return shiftSpanAt(shift, timeMin) !== undefined;
}

/** Whether a workplace is open to the public at a time. */
export function isOpenAt(staffing: WorkplaceStaffing, timeMin: number): boolean {
  if (staffing.slotCount === 0) return false;
  const { startMin, days } = staffing.open;
  return shiftCoversTime({ startMin, endMin: staffing.closeMin, days, kind: 'day' }, timeMin);
}

/** Seeded instant headcounts from an interior's role [min, max] ranges. */
function chosenRoleCounts(seed: string | number, parcelId: string, support: NpcSupport): number[] {
  return support.roles.map((slot) => {
    const [min, max] = slot.count;
    return min + rand(seed, 'rolecount', parcelId, slot.id).int(max - min + 1);
  });
}

/**
 * Rota for a transit post that runs with the service: the service window is
 * tiled by shift waves and covered every day by day crews, the way a station
 * or a depot is manned. No security posts: a station's guards are the city's,
 * not the platform's.
 */
export function staffTransit(postRoles: string[], serviceStartMin: number, serviceEndMin: number): WorkplaceStaffing {
  if (postRoles.length === 0) return EMPTY;
  const startMin = serviceStartMin % MIN_PER_DAY;
  const closeMin = serviceEndMin % MIN_PER_DAY;
  const spanMin = startMin === closeMin ? MIN_PER_DAY : spanOf(startMin, closeMin);
  const waves = Math.max(1, Math.ceil(spanMin / MAX_SHIFT_MIN));
  const open = rota(postRoles, waves, Math.ceil(ALL_DAYS.length / WORK_DAYS_PER_WEEK), Math.ceil(spanMin / waves), startMin, ALL_DAYS);
  return { open, closeMin, slotCount: open.slotCount };
}

export function staffWorkplace(
  seed: string | number,
  parcel: Parcel,
  floorArea: number,
  seats: number,
  support?: NpcSupport,
): WorkplaceStaffing {
  const profile = openingOf(parcel.type, support);
  if (!profile) return EMPTY;

  const nightOnly = !profile.allDay && hash01(seed, 'night', parcel.id) < profile.nightOnlyChance;
  const startMin = (nightOnly ? NIGHT_ONLY_HOURS.open : profile.open) % MIN_PER_DAY;
  const closeMin = (nightOnly ? NIGHT_ONLY_HOURS.close : profile.close) % MIN_PER_DAY;
  const days = nightOnly ? ALL_DAYS : profile.days;
  const spanMin = profile.allDay ? MIN_PER_DAY : spanOf(startMin, closeMin);
  const waves = profile.allDay ? 3 : profile.model === 'desk' ? 1 : Math.max(1, Math.ceil(spanMin / MAX_SHIFT_MIN));
  const shiftLenMin = profile.allDay
    ? MIN_PER_DAY / 3
    : profile.model === 'desk'
      ? Math.min(spanMin, DESK_SHIFT_MIN)
      : Math.ceil(spanMin / waves);
  const crews = Math.ceil(days.length / WORK_DAYS_PER_WEEK);

  const postRoles = postRolesOf(seed, parcel, floorArea, seats, profile, waves, crews, support);
  if (postRoles.length === 0) return EMPTY;
  const open = rota(postRoles, waves, crews, shiftLenMin, startMin, days);
  const watch = profile.venue === 'office' ? watchRota(startMin, closeMin) : undefined;

  return { open, ...(watch ? { watch } : {}), closeMin, slotCount: open.slotCount + (watch?.slotCount ?? 0) };
}

function rota(postRoles: string[], waves: number, crews: number, shiftLenMin: number, startMin: number, days: number[]): Rota {
  return { postRoles, waves, crews, shiftLenMin, startMin, days, slotCount: postRoles.length * waves * crews };
}

/** One guard through every hour the building is closed, every day of the week. */
function watchRota(openMin: number, closeMin: number): Rota {
  const spanMin = spanOf(closeMin, openMin);
  const waves = Math.max(1, Math.ceil(spanMin / MAX_SHIFT_MIN));
  const crews = Math.ceil(ALL_DAYS.length / WORK_DAYS_PER_WEEK);
  return rota(['security'], waves, crews, Math.ceil(spanMin / waves), closeMin, ALL_DAYS);
}

/**
 * The posts a building keeps on duty at once: the staff Interior publishes
 * for it, a service venue's own counter service on top, and otherwise the
 * floor area's worker capacity spread over the rota, which keeps total
 * employment area-driven. Published guest and resident roles are the people a
 * venue holds, not the people who work it, so they stay out.
 */
function postRolesOf(
  seed: string | number,
  parcel: Parcel,
  floorArea: number,
  seats: number,
  profile: OpeningProfile,
  waves: number,
  crews: number,
  support?: NpcSupport,
): string[] {
  const published = support ? publishedPosts(seed, parcel.id, support) : [];
  if (profile.venue === 'service' && !published.some(isServiceRole)) {
    return [...serviceCrew(parcel.type, seats), ...published];
  }
  if (published.length > 0) return published;

  const floors =
    parcel.envelope.minFloors +
    Math.floor(hash01(seed, 'floors', parcel.id) * (parcel.envelope.maxFloors - parcel.envelope.minFloors + 1));
  const capacity = Math.max(1, Math.floor((floorArea * floors) / (AREA_PER_WORKER[parcel.type] ?? 30)));
  const posts = Math.max(profile.allDay ? 2 : 1, Math.round(capacity / (waves * crews)));
  const guards = profile.allDay ? Math.min(Math.max(1, Math.round(posts * SECURITY_SHARE)), posts - 1) : 0;
  const role = DERIVED_ROLE[parcel.type] ?? 'worker';
  return [...new Array<string>(posts - guards).fill(role), ...new Array<string>(guards).fill('security')];
}

/** One entry per person the Interior puts on duty at once, its guests aside. */
function publishedPosts(seed: string | number, parcelId: string, support: NpcSupport): string[] {
  const counts = chosenRoleCounts(seed, parcelId, support);
  const posts: string[] = [];
  support.roles.forEach((slot, i) => {
    if (isGuestRole(slot.role)) return;
    for (let n = 0; n < counts[i]!; n++) posts.push(slot.role);
  });
  return posts;
}

/**
 * The rota a local slot belongs to, and its index inside that rota. The watch
 * takes the lowest slots: a building is watched through the hours nobody else
 * is in it before its day rota deepens.
 */
function rotaOfSlot(staffing: WorkplaceStaffing, localSlot: number): { rota: Rota; slot: number } {
  const watch = staffing.watch;
  if (watch && localSlot < watch.slotCount) return { rota: watch, slot: localSlot };
  return { rota: staffing.open, slot: localSlot - (watch?.slotCount ?? 0) };
}

/**
 * Slot layout: wave first, then crew, then post. Low slot indices spread over
 * the whole opening week before they deepen the headcount, and slots fill in
 * index order, so a half-staffed venue is open all its hours with a thin crew
 * rather than fully manned in the morning and shut in the afternoon.
 */
export function roleOfSlot(staffing: WorkplaceStaffing, localSlot: number): string {
  const { rota: r, slot } = rotaOfSlot(staffing, localSlot);
  const post = Math.floor(slot / (r.waves * r.crews)) % r.postRoles.length;
  return r.postRoles[post]!;
}

/** Deterministic shift for one local slot: its wave gives the hours, its crew the days. */
export function shiftForSlot(staffing: WorkplaceStaffing, localSlot: number): Shift {
  const { rota: r, slot } = rotaOfSlot(staffing, localSlot);
  const wave = slot % r.waves;
  const crew = Math.floor(slot / r.waves) % r.crews;
  const startMin = (r.startMin + wave * r.shiftLenMin) % MIN_PER_DAY;
  const endMin = (startMin + r.shiftLenMin) % MIN_PER_DAY;
  return { startMin, endMin, days: crewDays(r.days, crew), kind: shiftKind(startMin) };
}

/**
 * Crews split the open week without overlapping, so exactly one crew mans each
 * post on any open day: a weekly crew of five days, then a weekend crew of what
 * is left. On-duty headcount is the same on a Sunday as on a Tuesday.
 */
function crewDays(openDays: number[], crew: number): number[] {
  const days = openDays.slice(crew * WORK_DAYS_PER_WEEK, crew * WORK_DAYS_PER_WEEK + WORK_DAYS_PER_WEEK);
  return days.length > 0 ? days : openDays;
}

function shiftKind(startMin: number): Shift['kind'] {
  if (startMin >= 21 * 60 || startMin < 5 * 60) return 'night';
  if (startMin >= 14 * 60) return 'evening';
  return 'day';
}

function spanOf(openMin: number, closeMin: number): number {
  return closeMin > openMin ? closeMin - openMin : MIN_PER_DAY - openMin + closeMin;
}
