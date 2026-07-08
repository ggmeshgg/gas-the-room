import type { Vec2 } from "../geometry/Vec2";
import { clamp } from "../geometry/Vec2";

export class MiasmaField {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  values: Float32Array;

  constructor(width: number, height: number, cellSize: number) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.values = new Float32Array(width * height);
  }

  clear(): void {
    this.values.fill(0);
  }

  addCircle(center: Vec2, radius: number, intensity: number): void {
    const minX = Math.max(0, Math.floor((center.x - radius) / this.cellSize));
    const maxX = Math.min(this.width - 1, Math.ceil((center.x + radius) / this.cellSize));
    const minY = Math.max(0, Math.floor((center.y - radius) / this.cellSize));
    const maxY = Math.min(this.height - 1, Math.ceil((center.y + radius) / this.cellSize));

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const cx = (x + 0.5) * this.cellSize;
        const cy = (y + 0.5) * this.cellSize;
        const d = Math.hypot(cx - center.x, cy - center.y);
        if (d > radius) continue;
        const falloff = 1 - d / radius;
        const idx = y * this.width + x;
        this.values[idx] = clamp(this.values[idx] + intensity * falloff, 0, 4);
      }
    }
  }

  sample(point: Vec2): number {
    const x = Math.floor(point.x / this.cellSize);
    const y = Math.floor(point.y / this.cellSize);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.values[y * this.width + x] ?? 0;
  }

  decay(dt: number, decay: number): void {
    const keep = Math.max(0, 1 - decay * dt);
    for (let i = 0; i < this.values.length; i += 1) {
      this.values[i] *= keep;
    }
  }
}
