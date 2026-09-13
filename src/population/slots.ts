/** Maps employment ranks to job slots breadth-first across workplaces. */

import { lastAtMost } from '../core/search.js';

export class SlotOrder {
  /** Slot index each workplace's slots start at. */
  private readonly offsets: number[] = [];
  /** Workplace indices by slot count ascending, so a level is a suffix of it. */
  private readonly order: number[];
  private readonly orderPos: number[];
  private readonly sortedCounts: number[];
  /** sortedPrefix[i] = slots of the i lowest-count workplaces. */
  private readonly sortedPrefix: number[];
  private readonly maxCount: number;

  constructor(private readonly counts: number[]) {
    let total = 0;
    for (const c of counts) {
      this.offsets.push(total);
      total += c;
    }
    this.order = counts.map((_, i) => i).sort((a, b) => counts[a]! - counts[b]! || a - b);
    this.orderPos = new Array<number>(counts.length);
    this.order.forEach((w, pos) => (this.orderPos[w] = pos));
    this.sortedCounts = this.order.map((w) => counts[w]!);
    this.sortedPrefix = [0];
    for (const c of this.sortedCounts) this.sortedPrefix.push(this.sortedPrefix[this.sortedPrefix.length - 1]! + c);
    this.maxCount = this.sortedCounts[this.sortedCounts.length - 1] ?? 0;
  }

  /** The slot the rank-th employed resident takes. */
  slotOfRank(rank: number): number {
    const level = lastAtMost(this.maxCount + 1, (k) => this.levelStart(k), rank);
    const pos = rank - this.levelStart(level);
    const workplace = this.order[this.below(level) + pos]!;
    return this.offsets[workplace]! + level;
  }

  /** Inverse of slotOfRank: the employment rank that fills this slot. */
  rankOfSlot(globalSlot: number): number {
    const workplace = lastAtMost(this.counts.length, (i) => this.offsets[i]!, globalSlot);
    const level = globalSlot - this.offsets[workplace]!;
    return this.levelStart(level) + this.orderPos[workplace]! - this.below(level);
  }

  /** Slots at a depth below level, summed over workplaces: sum of min(level, count). */
  private levelStart(level: number): number {
    const below = this.below(level);
    return this.sortedPrefix[below]! + level * (this.counts.length - below);
  }

  /** How many workplaces are shallower than level, i.e. have no slot at it. */
  private below(level: number): number {
    let lo = 0;
    let hi = this.sortedCounts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.sortedCounts[mid]! <= level) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
