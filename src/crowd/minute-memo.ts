/**
 * Bounded memo of per-minute tables keyed by place. Trips in flight started
 * within the last period, so a query touches a short run of minutes per
 * district; keeping that window makes every start-minute lookup a hit.
 */

export class MinuteMemo<T> {
  private readonly byKey = new Map<string, Map<number, T>>();

  constructor(private readonly keep: number) {}

  get(key: string, t: number, compute: () => T): T {
    let minutes = this.byKey.get(key);
    if (!minutes) {
      minutes = new Map();
      this.byKey.set(key, minutes);
    }
    const hit = minutes.get(t);
    if (hit !== undefined) return hit;
    const value = compute();
    minutes.set(t, value);
    if (minutes.size > this.keep) minutes.delete(minutes.keys().next().value!);
    return value;
  }
}
