/**
 * Street presence calibration: what share of a city is out in public space at
 * a given minute of the day. Fitted to time-use and travel survey figures
 * (sources and arithmetic in docs/RESEARCH.md): a peak-hour city has roughly
 * an eighth of its people outdoors, a midday city a twelfth, a 04:00 city
 * almost nobody. Every traveller counts as visible: the world has no private
 * car traffic layer, so car trips show up as people on the street too.
 *
 * Three bases, three curves: employed people around their shift, residents out
 * on errands and leisure, and street regulars who live outdoors. Multiplied by
 * params.streetDensity at the call site.
 */

export type Curve = [minuteOfDay: number, share: number][];

/** Share of employed people travelling to or from work, or out on a break. */
export const COMMUTE_WEEKDAY: Curve = [
  [0, 0.008], [240, 0.005], [300, 0.012], [360, 0.05], [420, 0.11], [480, 0.13], [510, 0.12],
  [540, 0.075], [600, 0.035], [660, 0.04], [720, 0.06], [780, 0.055], [840, 0.035], [900, 0.05],
  [960, 0.085], [1020, 0.13], [1050, 0.12], [1080, 0.095], [1140, 0.06], [1200, 0.035],
  [1260, 0.025], [1320, 0.02], [1439, 0.01],
];

/** Weekends: no commute peak, but shops, bars and 24/7 posts still change shift. */
export const COMMUTE_WEEKEND: Curve = [
  [0, 0.01], [180, 0.006], [300, 0.008], [360, 0.018], [480, 0.05], [540, 0.06], [720, 0.05],
  [900, 0.045], [1020, 0.06], [1140, 0.05], [1260, 0.03], [1439, 0.012],
];

/** Share of residents out on errands and leisure; placed by street pull, not by home. */
export const ERRAND_WEEKDAY: Curve = [
  [0, 0.004], [300, 0.003], [360, 0.01], [420, 0.03], [480, 0.05], [540, 0.062], [600, 0.058],
  [660, 0.068], [720, 0.085], [780, 0.075], [840, 0.06], [900, 0.065], [960, 0.075], [1020, 0.08],
  [1080, 0.075], [1140, 0.06], [1200, 0.045], [1260, 0.032], [1320, 0.018], [1380, 0.008], [1439, 0.005],
];

/** Weekends start later, run wider through the afternoon and hold into the night. */
export const ERRAND_WEEKEND: Curve = [
  [0, 0.008], [240, 0.004], [360, 0.006], [480, 0.025], [540, 0.05], [600, 0.08], [720, 0.1],
  [840, 0.1], [960, 0.095], [1080, 0.085], [1200, 0.075], [1260, 0.06], [1320, 0.04], [1380, 0.022], [1439, 0.012],
];

/** Share of residents on their own streets: school runs, dog walks, kids out playing. */
export const LOCAL_PRESENCE: Curve = [
  [0, 0.002], [360, 0.004], [480, 0.02], [600, 0.025], [720, 0.025], [900, 0.03], [1020, 0.03],
  [1140, 0.022], [1260, 0.012], [1380, 0.005], [1439, 0.003],
];

/** Neighbourhood presence on days off. */
export const WEEKEND_LOCAL_FACTOR = 1.3;

/** Share of street-category people outdoors; they live in public space. */
export const STREET_REGULAR: Curve = [
  [0, 0.08], [300, 0.06], [420, 0.3], [600, 0.42], [1080, 0.45], [1260, 0.33], [1380, 0.18], [1439, 0.1],
];

/** Share of the people around a stop who are waiting for a vehicle rather than passing. */
export const TRANSIT_WAIT_SHARE = 0.05;

export function curveAt(curve: Curve, m: number): number {
  let prev = curve[0]!;
  for (const point of curve) {
    if (point[0] >= m) {
      const [x1, y1] = prev;
      const [x2, y2] = point;
      if (x2 === x1) return y2;
      return y1 + ((y2 - y1) * (m - x1)) / (x2 - x1);
    }
    prev = point;
  }
  return prev[1];
}
