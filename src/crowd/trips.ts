/**
 * Trip clock for one place. Slot s runs back-to-back trips of `period`
 * minutes staggered by s mod period, so trips start at every minute and a
 * handle {slot, trip} names one span [startMin, endMin). A trip exists when
 * its slot is below the place's count at its own start minute, so the count
 * read at the poll minute never ends a trip early.
 */

export interface Trip {
  slot: number;
  trip: number;
  startMin: number;
  endMin: number;
}

/** Count of people at a place at an integer minute. */
export type CountAt = (startMin: number) => number;

export class TripSchedule {
  constructor(readonly period: number) {}

  /** The trip a handle names, or undefined when it does not cover t or its slot was empty at its start. */
  at(slot: number, trip: number, t: number, countAt: CountAt): Trip | undefined {
    const startMin = trip * this.period + (slot % this.period);
    if (!(t >= startMin && t < startMin + this.period)) return undefined;
    if (slot >= countAt(startMin)) return undefined;
    return { slot, trip, startMin, endMin: startMin + this.period };
  }

  /** Every trip in flight at t, slots ascending. */
  alive(t: number, countAt: CountAt): Trip[] {
    const starts = this.startsBefore(t, countAt);
    const out: Trip[] = [];
    const top = Math.max(0, ...starts.map((s) => s.count));
    for (let slot = 0; slot < top; slot++) {
      const { startMin, count } = starts[slot % this.period]!;
      if (slot < count) out.push({ slot, trip: Math.floor(startMin / this.period), startMin, endMin: startMin + this.period });
    }
    return out;
  }

  /** How many trips are in flight at t, without listing them. */
  aliveCount(t: number, countAt: CountAt): number {
    let n = 0;
    for (const [r, { count }] of this.startsBefore(t, countAt).entries()) {
      if (count > r) n += Math.floor((count - 1 - r) / this.period) + 1;
    }
    return n;
  }

  /** For each residue r, the one start minute in (t - period, t] congruent to r, with the count then. */
  private startsBefore(t: number, countAt: CountAt): { startMin: number; count: number }[] {
    const last = Math.floor(t);
    const out: { startMin: number; count: number }[] = [];
    for (let r = 0; r < this.period; r++) {
      const startMin = last - mod(last - r, this.period);
      out.push({ startMin, count: startMin < 0 ? 0 : countAt(startMin) });
    }
    return out;
  }
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
