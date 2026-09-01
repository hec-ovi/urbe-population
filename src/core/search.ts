/** Greatest index i in [0, n) with get(i) <= target; get must be non-decreasing. */
export function lastAtMost(n: number, get: (i: number) => number, target: number): number {
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (get(mid) <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
