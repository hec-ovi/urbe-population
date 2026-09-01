/**
 * The map: districts, streets, parcels, transit stops and the walking crowd,
 * plus click routing to a dot or a staffed place, with hover effects and selection reticles.
 */

import { CanvasSurface } from '../components/canvas-surface.js';
import { CANVAS_THEME, DISTRICT_COLORS, DOT_COLORS, PARCEL_COLORS, colorOf } from '../theme.js';
import type { CrowdDot, Point, Scene, SceneParcel } from '../adapter/types.js';

export interface CityMapHandlers {
  onDot: (dotId: string) => void;
  onPlace: (parcelId: string) => void;
}

export interface PlacedDot {
  id: string;
  point: Point;
  activity: string;
}

export type MapSelection =
  | { kind: 'dot'; id: string }
  | { kind: 'parcel'; id: string }
  | undefined;

export class CityMapView {
  private readonly surface: CanvasSurface;
  private placed: PlacedDot[] = [];
  private selection: MapSelection;
  private hoveredEntity: { kind: 'dot' | 'parcel'; id: string; label: string } | undefined;
  private lastDots: CrowdDot[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly scene: Scene,
    private readonly handlers: CityMapHandlers,
  ) {
    this.surface = new CanvasSurface(canvas);
    this.surface.fit(scene.bounds);

    canvas.addEventListener('click', (event) => this.pick(this.surface.toWorld(event)));
    canvas.addEventListener('mousemove', (event) => this.handleMouseMove(this.surface.toWorld(event)));
    canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
  }

  setSelection(selection: MapSelection): void {
    this.selection = selection;
    this.render(this.lastDots);
  }

  render(dots: CrowdDot[]): void {
    this.lastDots = dots;
    this.surface.clear();

    // 1. Districts (Background polygons with subtle borders)
    for (const district of this.scene.districts) {
      this.surface.polygon(
        district.boundary,
        colorOf(DISTRICT_COLORS, district.kind, CANVAS_THEME.districtFallback),
        CANVAS_THEME.districtBorder,
        1,
      );
    }

    // 2. Streets (Base dark line + center line for crisp technical look)
    for (const street of this.scene.streets) {
      this.surface.polyline(street.path, CANVAS_THEME.street, CANVAS_THEME.streetWidthPx);
    }

    // 3. Parcels
    for (const parcel of this.scene.parcels) {
      const isSelected = this.selection?.kind === 'parcel' && this.selection.id === parcel.id;
      const isHovered = this.hoveredEntity?.kind === 'parcel' && this.hoveredEntity.id === parcel.id;
      const baseFill = colorOf(PARCEL_COLORS, parcel.type, CANVAS_THEME.parcelFallback);

      this.surface.polygon(
        parcel.footprint,
        baseFill,
        isSelected ? CANVAS_THEME.selectionHighlight : isHovered ? '#ffffff' : '#1a222f',
        isSelected ? 2 : isHovered ? 1.5 : 1,
      );

      if (isSelected) {
        this.surface.box(parcel.bounds, CANVAS_THEME.selectionHighlight, undefined, 1.5);
      }
    }

    // 4. Transit stops
    for (const stop of this.scene.stops) {
      this.surface.marker(stop.position, CANVAS_THEME.stopSizePx, CANVAS_THEME.stop, '#0b0e14', 1);
    }

    // 5. Crowd dots
    const spread = this.surface.worldPerPixel();
    this.placed = dots.map((dot) => ({
      id: dot.id,
      activity: dot.activity,
      point: [dot.position[0], dot.position[1] + jitterPx(dot.id) * spread] as Point,
    }));

    for (const dot of this.placed) {
      const isSelected = this.selection?.kind === 'dot' && this.selection.id === dot.id;
      const isHovered = this.hoveredEntity?.kind === 'dot' && this.hoveredEntity.id === dot.id;
      const dotColor = colorOf(DOT_COLORS, dot.activity, CANVAS_THEME.dotFallback);

      this.surface.marker(
        dot.point,
        isSelected ? CANVAS_THEME.dotSizePx + 4 : isHovered ? CANVAS_THEME.dotSizePx + 2 : CANVAS_THEME.dotSizePx,
        isSelected ? '#ffffff' : dotColor,
        isSelected ? CANVAS_THEME.selectionHighlight : '#000000',
        1,
      );

      if (isSelected) {
        this.surface.reticle(dot.point, 9, CANVAS_THEME.selectionHighlight);
      }
    }
  }

  private handleMouseMove(world: Point): void {
    const tolerance = CANVAS_THEME.dotHitPx * this.surface.worldPerPixel();
    let found: { kind: 'dot' | 'parcel'; id: string; label: string } | undefined;

    // Check dots
    for (const dot of this.placed) {
      if (Math.abs(dot.point[0] - world[0]) < tolerance && Math.abs(dot.point[1] - world[1]) < tolerance) {
        found = { kind: 'dot', id: dot.id, label: `Agent: ${dot.id} (${dot.activity})` };
        break;
      }
    }

    // Check parcels
    if (!found) {
      for (const parcel of this.scene.parcels) {
        if (parcel.staffed && contains(parcel, world, tolerance)) {
          found = { kind: 'parcel', id: parcel.id, label: `Place: ${parcel.id} [${parcel.type}]` };
          break;
        }
      }
    }

    const changed = found?.id !== this.hoveredEntity?.id;
    this.hoveredEntity = found;
    this.canvas.style.cursor = found ? 'pointer' : 'crosshair';

    if (changed) {
      this.render(this.lastDots);
    }
  }

  private handleMouseLeave(): void {
    if (this.hoveredEntity) {
      this.hoveredEntity = undefined;
      this.canvas.style.cursor = 'default';
      this.render(this.lastDots);
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
