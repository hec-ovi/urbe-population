/**
 * Time model: integer minutes since world epoch (Monday 00:00).
 * Routines repeat weekly.
 */

export const MIN_PER_DAY = 1440;
export const DAYS_PER_WEEK = 7;
export const MIN_PER_WEEK = MIN_PER_DAY * DAYS_PER_WEEK;

/** 0 = Monday. */
export function dayOf(t: number): number {
  return Math.floor(t / MIN_PER_DAY) % DAYS_PER_WEEK;
}

export function minuteOfDay(t: number): number {
  return ((t % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
}

export function minuteOfWeek(t: number): number {
  return ((t % MIN_PER_WEEK) + MIN_PER_WEEK) % MIN_PER_WEEK;
}

/** Whether minute-of-day m falls inside [start, end), spanning midnight when end < start. */
export function inWindow(m: number, start: number, end: number): boolean {
  if (start === end) return true;
  if (start < end) return m >= start && m < end;
  return m >= start || m < end;
}
