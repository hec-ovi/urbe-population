/**
 * Canvas palette and sizes. Everything outside the canvas is styled in
 * styles.css; this file is the canvas half of the same job.
 */

export const PARCEL_COLORS: Record<string, string> = {
  residential: '#3a6ea5',
  hotel: '#7a5c99',
  offices: '#2e8b8b',
  corpo: '#1f6f8b',
  hospital: '#c94f4f',
  clinic: '#c97f4f',
  police: '#2f4a8a',
  military: '#4a5d23',
  factory: '#8a6d3b',
  commerce: '#d98e32',
  mall: '#d9b432',
  restaurant: '#c9473f',
  coffee_shop: '#8a5a3b',
};

export const DISTRICT_COLORS: Record<string, string> = {
  downtown: '#181d24',
  commercial: '#1a1c1f',
  residential: '#171a17',
  industrial: '#1c1a17',
  mixed: '#181a1d',
};

export const DOT_COLORS: Record<string, string> = {
  commuting: '#7fd1b9',
};

export const CANVAS_THEME = {
  parcelFallback: '#666666',
  districtFallback: '#171a17',
  street: '#3a3f46',
  streetWidthPx: 4,
  stop: '#e0c341',
  stopSizePx: 6,
  dotFallback: '#d1a97f',
  dotSizePx: 4,
  /** Click tolerance around a dot, in pixels. */
  dotHitPx: 6,
};

export function colorOf(palette: Record<string, string>, key: string, fallback: string): string {
  return palette[key] ?? fallback;
}
