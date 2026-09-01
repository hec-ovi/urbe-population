/**
 * 2D canvas primitive: fits a world rectangle into the canvas and draws in
 * world coordinates. Knows nothing about the city.
 */

import type { Bounds, Point } from '../adapter/types.js';

export class CanvasSurface {
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;
  private offset: Point = [0, 0];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('testbed: 2d canvas context unavailable');
    this.ctx = ctx;
  }

  /** Uniform scale so the whole rectangle is visible, centered, with a pixel margin. */
  fit(bounds: Bounds, marginPx = 16): void {
    const width = Math.max(bounds.maxX - bounds.minX, 1);
    const height = Math.max(bounds.maxY - bounds.minY, 1);
    const usableW = Math.max(this.canvas.width - marginPx * 2, 1);
    const usableH = Math.max(this.canvas.height - marginPx * 2, 1);
    this.scale = Math.min(usableW / width, usableH / height);
    this.offset = [
      (this.canvas.width - width * this.scale) / 2 - bounds.minX * this.scale,
      (this.canvas.height - height * this.scale) / 2 - bounds.minY * this.scale,
    ];
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  polygon(points: Point[], fill: string, stroke?: string, strokeWidthPx = 1): void {
    if (points.length < 3) return;
    this.trace(points);
    this.ctx.closePath();
    this.ctx.fillStyle = fill;
    this.ctx.fill();
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = strokeWidthPx;
      this.ctx.stroke();
    }
  }

  polyline(points: Point[], stroke: string, widthPx: number): void {
    if (points.length < 2) return;
    this.trace(points);
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = widthPx;
    this.ctx.stroke();
  }

  /** Square marker of a fixed pixel size, centered on a world point. */
  marker(point: Point, sizePx: number, fill: string, stroke?: string, strokeWidthPx = 1): void {
    const [x, y] = this.toScreen(point);
    const half = Math.floor(sizePx / 2);
    this.ctx.fillStyle = fill;
    this.ctx.fillRect(x - half, y - half, sizePx, sizePx);
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = strokeWidthPx;
      this.ctx.strokeRect(x - half, y - half, sizePx, sizePx);
    }
  }

  /** Draw a world bounding box / rectangle. */
  box(bounds: Bounds, stroke: string, fill?: string, strokeWidthPx = 1): void {
    const min = this.toScreen([bounds.minX, bounds.minY]);
    const max = this.toScreen([bounds.maxX, bounds.maxY]);
    const x = Math.min(min[0], max[0]);
    const y = Math.min(min[1], max[1]);
    const w = Math.abs(max[0] - min[0]);
    const h = Math.abs(max[1] - min[1]);
    if (fill) {
      this.ctx.fillStyle = fill;
      this.ctx.fillRect(x, y, w, h);
    }
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = strokeWidthPx;
    this.ctx.strokeRect(x, y, w, h);
  }

  /** Draw technical reticle/target indicator around a point on screen. */
  reticle(point: Point, radiusPx = 10, stroke = '#00e5ff'): void {
    const [x, y] = this.toScreen(point);
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = 1.5;
    // Square crosshair frame
    const s = radiusPx;
    this.ctx.strokeRect(x - s, y - s, s * 2, s * 2);

    // Cross ticks
    this.ctx.beginPath();
    this.ctx.moveTo(x - s - 4, y);
    this.ctx.lineTo(x - s + 2, y);
    this.ctx.moveTo(x + s - 2, y);
    this.ctx.lineTo(x + s + 4, y);
    this.ctx.moveTo(x, y - s - 4);
    this.ctx.lineTo(x, y - s + 2);
    this.ctx.moveTo(x, y + s - 2);
    this.ctx.lineTo(x, y + s + 4);
    this.ctx.stroke();
  }

  toScreen(point: Point): Point {
    return [point[0] * this.scale + this.offset[0], point[1] * this.scale + this.offset[1]];
  }

  /** Pointer position in world coordinates, corrected for CSS scaling. */
  toWorld(event: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * this.canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * this.canvas.height;
    return [(x - this.offset[0]) / this.scale, (y - this.offset[1]) / this.scale];
  }

  /** World units covered by one canvas pixel: turns pixel tolerances into world ones. */
  worldPerPixel(): number {
    return 1 / this.scale;
  }

  private trace(points: Point[]): void {
    const start = points[0]!;
    const [sx, sy] = this.toScreen(start);
    this.ctx.beginPath();
    this.ctx.moveTo(sx, sy);
    for (const p of points.slice(1)) {
      const [x, y] = this.toScreen(p);
      this.ctx.lineTo(x, y);
    }
  }
}
