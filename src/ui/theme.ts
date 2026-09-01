/**
 * Canvas palette and sizes. Everything outside the canvas is styled in
 * styles.css; this file is the canvas half of the same job.
 */

export const PARCEL_COLORS: Record<string, string> = {
  residential: '#3b6ea5',
  hotel: '#7e57c2',
  offices: '#26a69a',
  corpo: '#1e88e5',
  hospital: '#e53935',
  clinic: '#fb8c00',
  police: '#3949ab',
  military: '#558b2f',
  factory: '#8d6e63',
  commerce: '#ffa726',
  mall: '#ffca28',
  restaurant: '#f4511e',
  coffee_shop: '#a1887f',
};

export const DISTRICT_COLORS: Record<string, string> = {
  downtown: '#141820',
  commercial: '#161922',
  residential: '#121614',
  industrial: '#191613',
  mixed: '#15171e',
};

export const DOT_COLORS: Record<string, string> = {
  commuting: '#00e5ff',
  transit_wait: '#facc15',
  working: '#38bdf8',
  shopping: '#c084fc',
  dining: '#fb923c',
  leisure: '#34d399',
  sleeping: '#64748b',
  wandering: '#f43f5e',
};

export const CANVAS_THEME = {
  parcelFallback: '#475569',
  districtFallback: '#101318',
  districtBorder: '#1e2633',
  street: '#252e3d',
  streetWidthPx: 4,
  streetOutline: '#151a23',
  stop: '#facc15',
  stopSizePx: 6,
  dotFallback: '#00e5ff',
  dotSizePx: 5,
  /** Click tolerance around a dot, in pixels. */
  dotHitPx: 8,
  selectionHighlight: '#00e5ff',
  hoverHighlight: '#ffffff',
};

export function colorOf(palette: Record<string, string>, key: string, fallback: string): string {
  return palette[key] ?? fallback;
}
