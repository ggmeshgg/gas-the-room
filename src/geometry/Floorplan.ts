import type { Vec2 } from "./Vec2";

export type TileKind = "wall" | "room" | "door" | "void";

export type Door = {
  id: string;
  gridX: number;
  gridY: number;
  center: Vec2;
  roomIds: string[];
};

export type Room = {
  id: string;
  cellCount: number;
};

export type Floorplan = {
  source: string;
  cellSize: number;
  width: number;
  height: number;
  tiles: string[];
  rooms: Map<string, Room>;
  doors: Door[];
};

const ROOM_RE = /^[1-9A-Z]$/;

export function parseFloorplan(source: string, cellSize = 32): Floorplan {
  const bodyLines = source
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("# ") && line.length > 0);

  if (bodyLines.length === 0) {
    throw new Error("Floorplan has no map rows");
  }

  const width = Math.max(...bodyLines.map((line) => line.length));
  const height = bodyLines.length;
  const tiles: string[] = [];
  const rooms = new Map<string, Room>();

  for (let y = 0; y < height; y += 1) {
    const line = bodyLines[y] ?? "";
    for (let x = 0; x < width; x += 1) {
      const ch = line[x] ?? " ";
      tiles.push(ch);
      if (ROOM_RE.test(ch)) {
        const room = rooms.get(ch) ?? { id: ch, cellCount: 0 };
        room.cellCount += 1;
        rooms.set(ch, room);
      }
    }
  }

  const doors: Door[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (tileAtRaw(tiles, width, height, x, y) !== "D") continue;
      const roomIds = new Set<string>();
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        const neighbor = tileAtRaw(tiles, width, height, nx, ny);
        if (ROOM_RE.test(neighbor)) roomIds.add(neighbor);
      }
      doors.push({
        id: `door-${doors.length + 1}`,
        gridX: x,
        gridY: y,
        center: { x: (x + 0.5) * cellSize, y: (y + 0.5) * cellSize },
        roomIds: [...roomIds].sort(),
      });
    }
  }

  if (!rooms.has("1")) {
    throw new Error("Floorplan must include spawn room 1");
  }

  return { source, cellSize, width, height, tiles, rooms, doors };
}

export function tileKindAt(plan: Floorplan, gx: number, gy: number): TileKind {
  const raw = tileAtRaw(plan.tiles, plan.width, plan.height, gx, gy);
  if (raw === "#") return "wall";
  if (raw === "D") return "door";
  if (ROOM_RE.test(raw)) return "room";
  return "void";
}

export function rawTileAtWorld(plan: Floorplan, point: Vec2): string {
  const gx = Math.floor(point.x / plan.cellSize);
  const gy = Math.floor(point.y / plan.cellSize);
  return tileAtRaw(plan.tiles, plan.width, plan.height, gx, gy);
}

export function rawTileAtGrid(plan: Floorplan, gx: number, gy: number): string {
  return tileAtRaw(plan.tiles, plan.width, plan.height, gx, gy);
}

export function gridAtWorld(plan: Floorplan, point: Vec2): { x: number; y: number } {
  return {
    x: Math.floor(point.x / plan.cellSize),
    y: Math.floor(point.y / plan.cellSize),
  };
}

export function isRoomGlyph(value: string): boolean {
  return ROOM_RE.test(value);
}

export function doorExitPoint(plan: Floorplan, door: Door, destinationRoomId: string): Vec2 | null {
  return doorAdjacentRoomPoint(plan, door, destinationRoomId);
}

export function doorAdjacentRoomPoint(plan: Floorplan, door: Door, roomId: string): Vec2 | null {
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const x = door.gridX + dx;
    const y = door.gridY + dy;
    if (tileAtRaw(plan.tiles, plan.width, plan.height, x, y) === roomId) {
      return { x: (x + 0.5) * plan.cellSize, y: (y + 0.5) * plan.cellSize };
    }
  }
  return null;
}

export function roomIdAtWorld(plan: Floorplan, point: Vec2, fallback: string | null): string | null {
  const gx = Math.floor(point.x / plan.cellSize);
  const gy = Math.floor(point.y / plan.cellSize);
  const raw = tileAtRaw(plan.tiles, plan.width, plan.height, gx, gy);
  if (ROOM_RE.test(raw)) return raw;
  if (raw !== "D") return null;
  const door = plan.doors.find((candidate) => candidate.gridX === gx && candidate.gridY === gy);
  if (!door) return fallback;
  if (fallback && door.roomIds.includes(fallback)) return fallback;
  return door.roomIds[0] ?? fallback;
}

export function isWalkableWorld(plan: Floorplan, point: Vec2): boolean {
  const gx = Math.floor(point.x / plan.cellSize);
  const gy = Math.floor(point.y / plan.cellSize);
  const kind = tileKindAt(plan, gx, gy);
  return kind === "room" || kind === "door";
}

export function isCircleWalkable(plan: Floorplan, center: Vec2, radius: number): boolean {
  const samples = [
    center,
    { x: center.x + radius, y: center.y },
    { x: center.x - radius, y: center.y },
    { x: center.x, y: center.y + radius },
    { x: center.x, y: center.y - radius },
    { x: center.x + radius * 0.7, y: center.y + radius * 0.7 },
    { x: center.x - radius * 0.7, y: center.y + radius * 0.7 },
    { x: center.x + radius * 0.7, y: center.y - radius * 0.7 },
    { x: center.x - radius * 0.7, y: center.y - radius * 0.7 },
  ];
  return samples.every((point) => isWalkableWorld(plan, point));
}

export function randomPointInRoom(plan: Floorplan, roomId: string, random: () => number): Vec2 {
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < plan.height; y += 1) {
    for (let x = 0; x < plan.width; x += 1) {
      if (tileAtRaw(plan.tiles, plan.width, plan.height, x, y) === roomId) cells.push({ x, y });
    }
  }
  if (cells.length === 0) {
    throw new Error(`Room ${roomId} has no cells`);
  }
  const cell = cells[Math.floor(random() * cells.length)];
  return {
    x: (cell.x + 0.2 + random() * 0.6) * plan.cellSize,
    y: (cell.y + 0.2 + random() * 0.6) * plan.cellSize,
  };
}

export function worldWidth(plan: Floorplan): number {
  return plan.width * plan.cellSize;
}

export function worldHeight(plan: Floorplan): number {
  return plan.height * plan.cellSize;
}

function tileAtRaw(tiles: string[], width: number, height: number, gx: number, gy: number): string {
  if (gx < 0 || gy < 0 || gx >= width || gy >= height) return " ";
  return tiles[gy * width + gx] ?? " ";
}
