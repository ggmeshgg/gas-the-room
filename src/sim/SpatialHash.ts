import type { Agent } from "../agents/Agent";
import type { Vec2 } from "../geometry/Vec2";
import { distance } from "../geometry/Vec2";

export class SpatialHash {
  private buckets = new Map<string, Agent[]>();

  constructor(private readonly cellSize: number) {}

  rebuild(agents: Agent[]): void {
    this.buckets.clear();
    for (const agent of agents) {
      const key = this.keyFor(agent.position);
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(agent);
      else this.buckets.set(key, [agent]);
    }
  }

  queryRadius(point: Vec2, radius: number): Agent[] {
    const minX = Math.floor((point.x - radius) / this.cellSize);
    const maxX = Math.floor((point.x + radius) / this.cellSize);
    const minY = Math.floor((point.y - radius) / this.cellSize);
    const maxY = Math.floor((point.y + radius) / this.cellSize);
    const result: Agent[] = [];

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const bucket = this.buckets.get(`${x},${y}`);
        if (!bucket) continue;
        for (const agent of bucket) {
          if (distance(point, agent.position) <= radius) result.push(agent);
        }
      }
    }

    return result;
  }

  private keyFor(point: Vec2): string {
    return `${Math.floor(point.x / this.cellSize)},${Math.floor(point.y / this.cellSize)}`;
  }
}
