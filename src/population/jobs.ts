/**
 * Job slots per workplace as a rota: how many people are on duty at once
 * (posts), how many shift waves tile the open span, and how many day crews
 * cover the open week. Every slot is one (post, wave, crew), so the slots of
 * an open venue always cover its opening hours on every day it opens.
 */

import { hash01, rand } from '../core/rng.js';
import { MIN_PER_DAY } from '../core/time.js';
import {
  ALL_DAYS,
  AREA_PER_WORKER,
  DESK_SHIFT_MIN,
  MAX_SHIFT_MIN,
  NIGHT_ONLY_HOURS,
  OPENING_BY_TYPE,
  WORK_DAYS_PER_WEEK,
} from './defaults.js';
import type { Parcel } from '../schemas/blueprint.js';
import type { NpcSupport } from '../schemas/interiors.js';
import type { Shift } from '../schemas/npc.js';

export interface WorkplaceStaffing {
  /** People on duty at once while open: one per post. */
  posts: number;
  /** Posts that are security posts; without an interior, the last ones. */
  securityPosts: number;
  /** Shift windows tiling the open span. */
  waves: number;
  /** Day crews covering the open week; each crew works up to 5 days. */
  crews: number;
  /** posts * waves * crews: every slot belongs to the rota. */
  slotCount: number;
  shiftLenMin: number;
  allDay: boolean;
  nightOnly: boolean;
  openMin: number;
  closeMin: number;
  openDays: number[];
}

const EMPTY: WorkplaceStaffing = {
  posts: 0,
  securityPosts: 0,
  waves: 0,
  crews: 0,
  slotCount: 0,
  shiftLenMin: 0,
  allDay: false,
  nightOnly: false,
  openMin: 0,
  closeMin: 0,
  openDays: [],
};

/** Share of a 24/7 venue's posts that watch doors and cameras. */
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

/** Seeded instant headcounts from an interior's role [min, max] ranges. */
export function chosenRoleCounts(seed: string | number, parcelId: string, support: NpcSupport): number[] {
  return support.roles.map((slot) => {
    const [min, max] = slot.count;
    return min + rand(seed, 'rolecount', parcelId, slot.id).int(max - min + 1);
  });
}

export function staffWorkplace(seed: string | number, parcel: Parcel, floorArea: number, support?: NpcSupport): WorkplaceStaffing {
  const profile = OPENING_BY_TYPE[parcel.type];
  if (!profile) return EMPTY;

  const nightOnly = !profile.allDay && hash01(seed, 'night', parcel.id) < profile.nightOnlyChance;
  const openMin = nightOnly ? NIGHT_ONLY_HOURS.open : profile.open;
  const closeMin = nightOnly ? NIGHT_ONLY_HOURS.close : profile.close;
  const openDays = nightOnly ? ALL_DAYS : profile.days;
  const spanMin = profile.allDay ? MIN_PER_DAY : spanOf(openMin, closeMin);
  const waves = profile.allDay ? 3 : profile.model === 'desk' ? 1 : Math.max(1, Math.ceil(spanMin / MAX_SHIFT_MIN));
  const shiftLenMin = profile.allDay
    ? MIN_PER_DAY / 3
    : profile.model === 'desk'
      ? Math.min(spanMin, DESK_SHIFT_MIN)
      : Math.ceil(spanMin / waves);
  const crews = Math.ceil(openDays.length / WORK_DAYS_PER_WEEK);

  const { posts, securityPosts } = postsOf(seed, parcel, floorArea, profile.allDay, waves, crews, support);
  if (posts === 0) return EMPTY;

  return {
    posts,
    securityPosts,
    waves,
    crews,
    slotCount: posts * waves * crews,
    shiftLenMin,
    allDay: profile.allDay,
    nightOnly,
    openMin,
    closeMin,
    openDays,
  };
}

/**
 * On-duty headcount: the interior's declared role counts when it has them,
 * otherwise the floor area's worker capacity spread over the rota, which keeps
 * total employment area-driven.
 */
function postsOf(
  seed: string | number,
  parcel: Parcel,
  floorArea: number,
  allDay: boolean,
  waves: number,
  crews: number,
  support?: NpcSupport,
): { posts: number; securityPosts: number } {
  if (support) {
    const counts = chosenRoleCounts(seed, parcel.id, support);
    let posts = 0;
    let securityPosts = 0;
    for (let i = 0; i < support.roles.length; i++) {
      posts += counts[i]!;
      if (support.roles[i]!.role === 'security') securityPosts += counts[i]!;
    }
    return { posts, securityPosts };
  }
  const floors =
    parcel.envelope.minFloors +
    Math.floor(hash01(seed, 'floors', parcel.id) * (parcel.envelope.maxFloors - parcel.envelope.minFloors + 1));
  const capacity = Math.max(1, Math.floor((floorArea * floors) / (AREA_PER_WORKER[parcel.type] ?? 30)));
  const posts = Math.max(allDay ? 2 : 1, Math.round(capacity / (waves * crews)));
  const securityPosts = allDay ? Math.min(Math.max(1, Math.round(posts * SECURITY_SHARE)), posts - 1) : 0;
  return { posts, securityPosts };
}

/**
 * Slot layout: wave first, then crew, then post. Low slot indices spread over
 * the whole opening week before they deepen the headcount, and slots fill in
 * index order, so a half-staffed venue is open all its hours with a thin crew
 * rather than fully manned in the morning and shut in the afternoon.
 */
export function postOfSlot(staffing: WorkplaceStaffing, localSlot: number): number {
  if (staffing.posts === 0) return 0;
  return Math.floor(localSlot / (staffing.waves * staffing.crews)) % staffing.posts;
}

/** Whether this local slot is one of the workplace's security posts. */
export function isSecuritySlot(staffing: WorkplaceStaffing, localSlot: number): boolean {
  return postOfSlot(staffing, localSlot) >= staffing.posts - staffing.securityPosts;
}

/** Deterministic shift for one local slot: its wave gives the hours, its crew the days. */
export function shiftForSlot(staffing: WorkplaceStaffing, localSlot: number): Shift {
  const wave = localSlot % staffing.waves;
  const crew = Math.floor(localSlot / staffing.waves) % staffing.crews;
  const startMin = (staffing.openMin + wave * staffing.shiftLenMin) % MIN_PER_DAY;
  const endMin = (startMin + staffing.shiftLenMin) % MIN_PER_DAY;
  return { startMin, endMin, days: crewDays(staffing.openDays, crew), kind: shiftKind(startMin) };
}

/**
 * Crews split the open week without overlapping, so exactly one crew mans each
 * post on any open day: a weekly crew of five days, then a weekend crew of what
 * is left. On-duty headcount is the same on a Sunday as on a Tuesday.
 */
function crewDays(openDays: number[], crew: number): number[] {
  const start = crew * WORK_DAYS_PER_WEEK;
  const days = openDays.slice(start, start + WORK_DAYS_PER_WEEK);
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
