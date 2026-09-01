/** Week-clock formatting. Minute 0 is Monday 00:00. */

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function dayName(dayIndex: number): string {
  return DAY_NAMES[((dayIndex % 7) + 7) % 7] ?? '?';
}

/** "Wed 09:05" from a minute of the week. */
export function formatClock(timeMin: number): string {
  return `${dayName(Math.floor(timeMin / 1440))} ${formatHourMin(timeMin % 1440)}`;
}

/** "09:05" from a minute of the day. */
export function formatHourMin(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  return `${String(h).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

/** Get time of day period description (e.g. Morning Rush, Midday, Evening, Night). */
export function timePeriod(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  if (hour >= 6 && hour < 9) return 'Morning Rush';
  if (hour >= 9 && hour < 12) return 'Morning Work';
  if (hour >= 12 && hour < 14) return 'Lunch Rush';
  if (hour >= 14 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 20) return 'Evening Rush';
  if (hour >= 20 && hour < 24) return 'Night / Leisure';
  return 'Quiet Hours';
}
