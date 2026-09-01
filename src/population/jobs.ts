/**
 * Job slots per workplace: staffing counts (24/7 coverage arithmetic included)
 * and the deterministic shift pattern each slot carries.
 */

import { hash01, rand } from '../core/rng.js';
import { AREA_PER_WORKER, FTE_PER_247_POST, NIGHT_ONLY_HOURS, OPENING_BY_TYPE, RELIEF_FACTOR } from './defaults.js';
import type { Parcel } from '../schemas/blueprint.js';
import type { NpcSupport } from '../schemas/interiors.js';
import type { Shift } from '../schemas/npc.js';

export interface WorkplaceStaffing {
  slotCount: number;
  /** Continuously staffed posts; 0 for non-24/7 workplaces. */
  posts: number;
  securityPosts: number;
  allDay: boolean;
  nightOnly: boolean;
  openMin: number;
  closeMin: number;
}

const WEEKDAYS = [0, 1, 2, 3, 4];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const SHIFT_247_STARTS = [6 * 60, 14 * 60, 22 * 60];

/** Whether a shift covers an absolute time, midnight spans included. */
export function shiftCoversTime(shift: Shift, timeMin: number): boolean {
  const day = Math.floor(timeMin / 1440) % 7;
  const m = ((timeMin % 1440) + 1440) % 1440;
  const { startMin, endMin, days } = shift;
  if (startMin === endMin) return days.includes(day);
  if (startMin < endMin) return m >= startMin && m < endMin && days.includes(day);
  if (m >= startMin) return days.includes(day);
  return m < endMin && days.includes((day + 6) % 7);
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
  if (!profile) return { slotCount: 0, posts: 0, securityPosts: 0, allDay: false, nightOnly: false, openMin: 0, closeMin: 0 };
  const floors = 1 + Math.floor(hash01(seed, 'floors', parcel.id) * (parcel.envelope.maxFloors - parcel.envelope.minFloors + 1)) + parcel.envelope.minFloors - 1;
  const capacity = Math.max(1, Math.floor((floorArea * floors) / (AREA_PER_WORKER[parcel.type] ?? 30)));
  let instant = 0;
  let securityInstant = 0;
  if (support) {
    const counts = chosenRoleCounts(seed, parcel.id, support);
    for (let i = 0; i < support.roles.length; i++) {
      if (support.roles[i]!.role === 'security') securityInstant += counts[i]!;
      else instant += counts[i]!;
    }
  }
  if (profile.allDay) {
    const posts = Math.max(1, instant > 0 ? instant : Math.round(capacity / 10));
    const securityPosts = Math.max(1, securityInstant > 0 ? securityInstant : Math.round(posts / 2));
    const slotCount = Math.ceil((posts + securityPosts) * FTE_PER_247_POST * RELIEF_FACTOR);
    return { slotCount, posts, securityPosts, allDay: true, nightOnly: false, openMin: 0, closeMin: 0 };
  }
  const nightOnly = hash01(seed, 'night', parcel.id) < profile.nightOnlyChance;
  const openMin = nightOnly ? NIGHT_ONLY_HOURS.open : profile.open;
  const closeMin = nightOnly ? NIGHT_ONLY_HOURS.close : profile.close;
  let slotCount = capacity;
  if (instant + securityInstant > 0) {
    const spanMin = closeMin > openMin ? closeMin - openMin : 1440 - openMin + closeMin;
    const waves = Math.max(1, Math.ceil(spanMin / 540));
    slotCount = (instant + securityInstant) * waves;
  }
  return { slotCount, posts: 0, securityPosts: 0, allDay: false, nightOnly, openMin, closeMin };
}

/** Whether this local slot is one of the workplace's security slots. */
export function isSecuritySlot(staffing: WorkplaceStaffing, localSlot: number): boolean {
  if (!staffing.allDay) return false;
  const perPost = FTE_PER_247_POST * RELIEF_FACTOR;
  return localSlot >= Math.ceil(staffing.posts * perPost);
}

/** Deterministic shift for one local slot of a workplace. */
export function shiftForSlot(seed: string | number, parcelId: string, staffing: WorkplaceStaffing, localSlot: number): Shift {
  if (staffing.allDay) {
    const start = SHIFT_247_STARTS[localSlot % 3]!;
    const end = (start + 8 * 60) % 1440;
    const r = rand(seed, 'shiftdays', parcelId, localSlot);
    const off1 = r.int(7);
    const off2 = (off1 + 1 + r.int(6)) % 7;
    const days = ALL_DAYS.filter((d) => d !== off1 && d !== off2);
    const kind = start === 22 * 60 ? 'night' : start === 14 * 60 ? 'evening' : 'day';
    return { startMin: start, endMin: end, days, kind };
  }
  const r = rand(seed, 'shift', parcelId, localSlot);
  const spanMin = staffing.closeMin > staffing.openMin ? staffing.closeMin - staffing.openMin : 1440 - staffing.openMin + staffing.closeMin;
  const shiftLen = Math.min(spanMin, (8 + r.int(3)) * 60);
  const latestStart = spanMin - shiftLen;
  const start = (staffing.openMin + (latestStart > 0 ? r.int(latestStart + 1) : 0)) % 1440;
  const end = (start + shiftLen) % 1440;
  const days = staffing.nightOnly || r.next() < 0.25 ? ALL_DAYS.filter((d) => d !== r.int(7) && d !== (3 + r.int(4))) : WEEKDAYS;
  const kind = staffing.nightOnly || start >= 21 * 60 ? 'night' : start >= 14 * 60 ? 'evening' : 'day';
  return { startMin: start, endMin: end, days, kind };
}
