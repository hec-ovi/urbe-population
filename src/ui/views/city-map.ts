/**
 * The map: districts, streets, parcels, transit stops and the walking crowd,
 * plus click routing to a dot or a staffed place.
 */

import { CanvasSurface } from '../components/canvas-surface.js';
import { CANVAS_THEME, DISTRICT_COLORS, DOT_COLORS, PARCEL_COLORS, colorOf } from '../theme.js';
import type { CrowdDot, Point, Scene, SceneParcel } from '../adapter/types.js';

export interface CityMapHandlers {
  onDot: (dotId: string) => void;
  onPlace: (parcelId: string) => void;
}

interface PlacedDot {
  id: string;
  point: Point;
  activity: string;
}

export class CityMapView {
  private readonly surface: CanvasSurface;
  private placed: PlacedDot[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    private readonly scene: Scene,
    private readonly handlers: CityMapHandlers,
  ) {
    this.surface = new CanvasSurface(canvas);
    this.surface.fit(scene.bounds);
    canvas.addEventListener('click', (event) => this.pick(this.surface.toWorld(event)));
  }

  render(dots: CrowdDot[]): void {
    this.surface.clear();
    for (const district of this.scene.districts) {
      this.surface.polygon(district.boundary, colorOf(DISTRICT_COLORS, district.kind, CANVAS_THEME.districtFallback));
    }
    for (const street of this.scene.streets) {
      this.surface.polyline(street.path, CANVAS_THEME.street, CANVAS_THEME.streetWidthPx);
    }
    for (const parcel of this.scene.parcels) {
      this.surface.polygon(parcel.footprint, colorOf(PARCEL_COLORS, parcel.type, CANVAS_THEME.parcelFallback));
    }
    for (const stop of this.scene.stops) {
      this.surface.marker(stop.position, CANVAS_THEME.stopSizePx, CANVAS_THEME.stop);
    }

    const spread = this.surface.worldPerPixel();
    this.placed = dots.map((dot) => ({
      id: dot.id,
      activity: dot.activity,
      point: [dot.position[0], dot.position[1] + jitterPx(dot.id) * spread] as Point,
    }));
    for (const dot of this.placed) {
      this.surface.marker(dot.point, CANVAS_THEME.dotSizePx, colorOf(DOT_COLORS, dot.activity, CANVAS_THEME.dotFallback));
    }
  }

  private pick(world: Point): void {
    const tolerance = CANVAS_THEME.dotHitPx * this.surface.worldPerPixel();
    for (const dot of this.placed) {
      if (Math.abs(dot.point[0] - world[0]) < tolerance && Math.abs(dot.point[1] - world[1]) < tolerance) {
        this.handlers.onDot(dot.id);
        return;
      }
    }
    for (const parcel of this.scene.parcels) {
      if (parcel.staffed && contains(parcel, world, tolerance)) {
        this.handlers.onPlace(parcel.id);
        return;
      }
    }
  }
}

function contains(parcel: SceneParcel, [x, y]: Point, tolerance: number): boolean {
  const b = parcel.bounds;
  return x >= b.minX - tolerance && x <= b.maxX + tolerance && y >= b.minY - tolerance && y <= b.maxY + tolerance;
}

/** Small stable vertical offset so dots on the same spot stay separable. */
function jitterPx(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 9;
  return hash - 4;
}
