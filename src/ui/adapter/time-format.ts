/** Week-clock formatting. Minute 0 is Monday 00:00. */

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function dayName(dayIndex: number): string {
  return DAY_NAMES[((dayIndex % 7) + 7) % 7] ?? '?';
}

/** "09:05" from a minute of the day. */
export function formatHourMin(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  return `${String(h).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

