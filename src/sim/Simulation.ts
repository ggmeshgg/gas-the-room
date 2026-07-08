import type { Agent } from "../agents/Agent";
import type { Door, Floorplan } from "../geometry/Floorplan";
import {
  doorAdjacentRoomPoint,
  doorExitPoint,
  isRoomGlyph,
  parseFloorplan,
  randomPointInRoom,
  rawTileAtWorld,
  roomIdAtWorld,
} from "../geometry/Floorplan";
import { distance, lerp, normalize, scale, sub } from "../geometry/Vec2";
import { MiasmaField } from "../miasma/MiasmaField";
import { Random } from "./Random";
import type { SimConfig } from "./SimConfig";
import { SpatialHash } from "./SpatialHash";

export type DiagnosticsSnapshot = {
  globalVote1Fraction: number;
  perRoomVote1Fraction: Record<string, number>;
  committedCount: number;
  leavingCount: number;
  estimatedPc: number | null;
  history: Array<{ t: number; p: number }>;
};

export type SimState = {
  time: number;
  floorplan: Floorplan;
  agents: Agent[];
  miasma: MiasmaField;
  diagnostics: DiagnosticsSnapshot;
};

export class Simulation {
  readonly state: SimState;
  private readonly rng = new Random(0xdecafbad);
  private interactionAccumulator = 0;
  private diagnosticAccumulator = 0;
  private spatialHash: SpatialHash;
  private lastNeighborLinks: Array<[Agent, Agent]> = [];

  constructor(source: string, private config: SimConfig) {
    const floorplan = parseFloorplan(source);
    this.state = {
      time: 0,
      floorplan,
      agents: [],
      miasma: new MiasmaField(floorplan.width, floorplan.height, floorplan.cellSize),
      diagnostics: emptyDiagnostics(),
    };
    this.spatialHash = new SpatialHash(config.interactionRadius);
    this.resetAgents();
  }

  get neighborLinks(): Array<[Agent, Agent]> {
    return this.lastNeighborLinks;
  }

  setConfig(config: SimConfig): void {
    this.config = config;
  }

  loadFloorplan(source: string): void {
    const floorplan = parseFloorplan(source);
    this.state.floorplan = floorplan;
    this.state.miasma = new MiasmaField(floorplan.width, floorplan.height, floorplan.cellSize);
    this.resetAgents();
  }

  resetAgents(): void {
    this.state.agents = [];
    for (let i = 0; i < this.config.agentCount; i += 1) {
      const position = randomPointInRoom(this.state.floorplan, "1", () => this.rng.next());
      this.state.agents.push({
        id: `agent-${i + 1}`,
        position,
        velocity: { x: 0, y: 0 },
        vote: 0,
        timer: 0,
        mode: "wandering",
        exposure: 0,
        sensitivity: this.rng.range(0.75, 1.25),
        stubbornness: this.rng.range(0.02, 0.18),
        speed: this.config.agentSpeed * this.rng.range(0.75, 1.25),
        interactionRadius: this.config.interactionRadius * this.rng.range(0.85, 1.15),
        currentRoomId: "1",
        targetDoorId: null,
        leavingRoomId: null,
        destinationRoomId: null,
        wanderAngle: this.rng.range(0, Math.PI * 2),
        wanderTime: this.rng.range(0, 1.5),
      });
    }
    this.state.time = 0;
    this.state.diagnostics = emptyDiagnostics();
  }

  step(dt: number): void {
    this.state.time += dt;
    this.stepMiasma(dt);
    this.stepExposure(dt);
    this.stepMovement(dt);
    this.stepInteractions(dt);
    this.stepTimers(dt);
    this.updateDiagnostics(dt);
  }

  sprayMiasma(point: { x: number; y: number }, radius: number): void {
    this.state.miasma.addCircle(point, radius, this.config.miasmaIntensity);
  }

  private stepMiasma(dt: number): void {
    this.state.miasma.decay(dt, this.config.miasmaDecay);
  }

  private stepExposure(dt: number): void {
    for (const agent of this.state.agents) {
      const localMiasma = this.state.miasma.sample(agent.position);
      if (localMiasma > 0.02) {
        agent.exposure = Math.min(
          4,
          agent.exposure + localMiasma * agent.sensitivity * this.config.exposureSensitivity * dt,
        );
        const flipProbability = Math.min(1, agent.exposure * 0.55 * dt);
        if (this.rng.chance(flipProbability)) {
          agent.vote = 1;
          if (agent.mode === "wandering") agent.mode = "votingToLeave";
        }
      } else {
        agent.exposure = Math.max(0, agent.exposure - this.config.exposureDecay * dt);
      }
    }
  }

  private stepMovement(dt: number): void {
    const radius = 5;
    for (const agent of this.state.agents) {
      agent.speed = this.config.agentSpeed;
      agent.interactionRadius = this.config.interactionRadius;

      let desired = { x: 0, y: 0 };
      if (agent.mode === "committedToLeave" || agent.mode === "leavingThroughDoor") {
        if (!this.hasValidDoorTarget(agent)) this.assignDoorTarget(agent);
        const target = this.doorMovementTarget(agent);
        if (target) desired = normalize(sub(target, agent.position));
      } else {
        agent.wanderTime -= dt;
        if (agent.wanderTime <= 0) {
          agent.wanderAngle += this.rng.range(-1.7, 1.7);
          agent.wanderTime = this.rng.range(0.35, 1.4);
        }
        desired = { x: Math.cos(agent.wanderAngle), y: Math.sin(agent.wanderAngle) };
      }

      const nextVelocity = scale(desired, agent.speed);
      this.tryMove(agent, nextVelocity, dt, radius);

      const previousRoom = agent.currentRoomId;
      agent.currentRoomId = roomIdAtWorld(this.state.floorplan, agent.position, previousRoom);

      if (agent.targetDoorId) {
        const door = this.state.floorplan.doors.find((candidate) => candidate.id === agent.targetDoorId);
        if (door && this.shouldTeleportThroughDoor(agent, door)) {
          this.teleportThroughDoor(agent, door);
        } else if (door && distance(agent.position, door.center) < this.state.floorplan.cellSize * 0.35) {
          agent.mode = "leavingThroughDoor";
        }
        if (agent.destinationRoomId && agent.currentRoomId === agent.destinationRoomId) {
          this.completeDoorTransition(agent);
        }
      }
    }
  }

  private tryMove(agent: Agent, velocity: { x: number; y: number }, dt: number, radius: number): void {
    const nextX = { x: agent.position.x + velocity.x * dt, y: agent.position.y };
    const nextY = { x: agent.position.x, y: agent.position.y + velocity.y * dt };
    let moved = false;

    if (this.isCircleAllowedForAgent(agent, nextX, radius)) {
      agent.position.x = nextX.x;
      moved = true;
    } else {
      agent.wanderAngle += this.rng.range(1.5, 3.0);
    }
    if (this.isCircleAllowedForAgent(agent, nextY, radius)) {
      agent.position.y = nextY.y;
      moved = true;
    } else {
      agent.wanderAngle += this.rng.range(1.5, 3.0);
    }
    agent.velocity = moved ? velocity : { x: 0, y: 0 };
  }

  private stepInteractions(dt: number): void {
    this.interactionAccumulator += dt;
    const interval = 1 / Math.max(1, this.config.interactionHz);
    this.lastNeighborLinks = [];

    while (this.interactionAccumulator >= interval) {
      this.spatialHash = new SpatialHash(this.config.interactionRadius);
      this.spatialHash.rebuild(this.state.agents);
      for (let i = 0; i < this.config.tripletSamplesPerTick; i += 1) {
        const center = this.state.agents[this.rng.int(this.state.agents.length)];
        const centerRoom = this.interactionRoomId(center);
        if (!centerRoom) continue;
        const neighbors = this.spatialHash
          .queryRadius(center.position, center.interactionRadius)
          .filter(
            (agent) =>
              this.interactionRoomId(agent) === centerRoom &&
              this.hasInteractionLineOfSight(center, agent, centerRoom),
          );
        if (neighbors.length >= 3) {
          const triplet = this.sampleDistinct(neighbors, 3);
          this.applyTripletMajority(triplet);
          if (this.config.showNeighborLinks && this.lastNeighborLinks.length < 80) {
            this.lastNeighborLinks.push([triplet[0], triplet[1]], [triplet[0], triplet[2]]);
          }
        }
        if (neighbors.length >= 2) {
          const pair = this.sampleDistinct(neighbors, 2);
          this.applyPairForgetting(pair[0], pair[1]);
        }
      }
      this.applySpontaneousForgetting(interval);
      this.interactionAccumulator -= interval;
    }
  }

  private applyTripletMajority(triplet: Agent[]): void {
    const votes = triplet[0].vote + triplet[1].vote + triplet[2].vote;
    if (votes === 1) {
      for (const agent of triplet) {
        if (agent.vote === 1 && this.resistsReset(agent)) continue;
        agent.vote = 0;
      }
    } else if (votes === 2) {
      for (const agent of triplet) {
        agent.vote = 1;
        if (agent.mode === "wandering") agent.mode = "votingToLeave";
      }
    }
  }

  private applyPairForgetting(a: Agent, b: Agent): void {
    if (this.config.forgettingMode === "spontaneousX1ToX0") return;
    if (a.vote === b.vote || !this.rng.chance(this.config.forgettingRate)) return;
    if (a.vote === 1 && !this.resistsReset(a)) a.vote = 0;
    if (b.vote === 1 && !this.resistsReset(b)) b.vote = 0;
  }

  private applySpontaneousForgetting(dt: number): void {
    if (this.config.forgettingMode === "pairwise10To00") return;
    for (const agent of this.state.agents) {
      if (agent.vote === 0 || agent.mode === "committedToLeave" || agent.mode === "leavingThroughDoor") continue;
      const probability = this.config.spontaneousDecayRate * dt * (1 - this.resetResistance(agent));
      if (this.rng.chance(probability)) agent.vote = 0;
    }
  }

  private resistsReset(agent: Agent): boolean {
    return this.rng.chance(this.resetResistance(agent));
  }

  private resetResistance(agent: Agent): number {
    const localMiasma = this.state.miasma.sample(agent.position);
    return Math.min(0.92, agent.stubbornness + agent.exposure * 0.18 + localMiasma * 0.22);
  }

  private stepTimers(dt: number): void {
    for (const agent of this.state.agents) {
      if (agent.vote === 1) {
        agent.timer += dt;
        if (agent.mode === "wandering") agent.mode = "votingToLeave";
      } else {
        if (this.config.timerMode === "reset") {
          agent.timer = 0;
        } else {
          agent.timer = Math.max(0, agent.timer - this.config.timerDecayRate * dt);
        }
        if (agent.timer <= 0 && agent.mode === "votingToLeave") agent.mode = "wandering";
      }

      if (
        agent.timer >= this.config.leaveTimerSeconds &&
        agent.mode !== "committedToLeave" &&
        agent.mode !== "leavingThroughDoor"
      ) {
        agent.vote = 1;
        agent.mode = "committedToLeave";
        this.assignDoorTarget(agent);
      }
    }
  }

  private chooseDoor(agent: Agent): string | null {
    if (!agent.currentRoomId) return null;
    const candidates = this.state.floorplan.doors.filter((door) => door.roomIds.includes(agent.currentRoomId ?? ""));
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => distance(agent.position, a.center) - distance(agent.position, b.center));
    return candidates[0].id;
  }

  private completeDoorTransition(agent: Agent): void {
    agent.targetDoorId = null;
    agent.leavingRoomId = null;
    agent.destinationRoomId = null;
    agent.mode = "wandering";
    agent.vote = 0;
    agent.timer = 0;
  }

  private shouldTeleportThroughDoor(agent: Agent, door: Door): boolean {
    if (agent.mode !== "committedToLeave" && agent.mode !== "leavingThroughDoor") return false;
    if (!agent.destinationRoomId) return false;
    const raw = rawTileAtWorld(this.state.floorplan, agent.position);
    return raw === "D" || distance(agent.position, door.center) < this.state.floorplan.cellSize * 0.72;
  }

  private teleportThroughDoor(agent: Agent, door: Door): void {
    if (!agent.destinationRoomId) return;
    const exit = doorExitPoint(this.state.floorplan, door, agent.destinationRoomId);
    if (!exit) return;
    agent.position = { ...exit };
    agent.currentRoomId = agent.destinationRoomId;
    agent.mode = "leavingThroughDoor";
    this.completeDoorTransition(agent);
  }

  private assignDoorTarget(agent: Agent): void {
    const leavingRoomId = agent.currentRoomId;
    if (!leavingRoomId) {
      agent.targetDoorId = null;
      agent.leavingRoomId = null;
      agent.destinationRoomId = null;
      return;
    }

    const doorId = this.chooseDoor(agent);
    const door = this.state.floorplan.doors.find((candidate) => candidate.id === doorId);
    const destinationRoomId = door?.roomIds.find((roomId) => roomId !== leavingRoomId) ?? null;

    agent.targetDoorId = door?.id ?? null;
    agent.leavingRoomId = door ? leavingRoomId : null;
    agent.destinationRoomId = destinationRoomId;
  }

  private hasValidDoorTarget(agent: Agent): boolean {
    if (!agent.targetDoorId || !agent.leavingRoomId || !agent.destinationRoomId) return false;
    const door = this.state.floorplan.doors.find((candidate) => candidate.id === agent.targetDoorId);
    return Boolean(
      door &&
        door.roomIds.includes(agent.leavingRoomId) &&
        door.roomIds.includes(agent.destinationRoomId) &&
        doorExitPoint(this.state.floorplan, door, agent.destinationRoomId),
    );
  }

  private doorMovementTarget(agent: Agent): { x: number; y: number } | null {
    if (!agent.targetDoorId || !agent.leavingRoomId || !agent.destinationRoomId) return null;
    const door = this.state.floorplan.doors.find((candidate) => candidate.id === agent.targetDoorId);
    if (!door) return null;
    const raw = rawTileAtWorld(this.state.floorplan, agent.position);
    const approach = doorAdjacentRoomPoint(this.state.floorplan, door, agent.leavingRoomId);
    const exit = doorExitPoint(this.state.floorplan, door, agent.destinationRoomId);
    const doorReach = this.state.floorplan.cellSize * 0.28;

    if (raw === agent.destinationRoomId) return null;
    if (raw === "D") return exit ?? door.center;
    if (raw === agent.leavingRoomId && approach && distance(agent.position, approach) > doorReach) {
      return approach;
    }
    if (raw === agent.leavingRoomId) return door.center;
    return exit ?? door.center;
  }

  private isCircleAllowedForAgent(agent: Agent, center: { x: number; y: number }, radius: number): boolean {
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
    return samples.every((point) => this.isPointAllowedForAgent(agent, point));
  }

  private isPointAllowedForAgent(agent: Agent, point: { x: number; y: number }): boolean {
    if (this.isPointInsideTargetDoorCorridor(agent, point)) return true;

    const raw = rawTileAtWorld(this.state.floorplan, point);
    if (!isRoomGlyph(raw) && raw !== "D") return false;

    if (agent.mode !== "committedToLeave" && agent.mode !== "leavingThroughDoor") {
      return raw === agent.currentRoomId;
    }

    if (raw === agent.leavingRoomId || raw === agent.destinationRoomId) return true;
    if (raw !== "D") return false;

    return false;
  }

  private isPointInsideTargetDoorCorridor(agent: Agent, point: { x: number; y: number }): boolean {
    if (
      agent.mode !== "committedToLeave" &&
      agent.mode !== "leavingThroughDoor"
    ) {
      return false;
    }
    if (!agent.targetDoorId || !agent.leavingRoomId || !agent.destinationRoomId) return false;

    const door = this.state.floorplan.doors.find((candidate) => candidate.id === agent.targetDoorId);
    if (!door) return false;

    const approach = doorAdjacentRoomPoint(this.state.floorplan, door, agent.leavingRoomId);
    const exit = doorExitPoint(this.state.floorplan, door, agent.destinationRoomId);
    if (!approach || !exit) return false;

    const halfWidth = this.state.floorplan.cellSize * 0.52;
    const minX = Math.min(approach.x, door.center.x, exit.x) - halfWidth;
    const maxX = Math.max(approach.x, door.center.x, exit.x) + halfWidth;
    const minY = Math.min(approach.y, door.center.y, exit.y) - halfWidth;
    const maxY = Math.max(approach.y, door.center.y, exit.y) + halfWidth;

    return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
  }

  private interactionRoomId(agent: Agent): string | null {
    if ((agent.mode === "committedToLeave" || agent.mode === "leavingThroughDoor") && agent.leavingRoomId) {
      return agent.leavingRoomId;
    }
    return agent.currentRoomId;
  }

  private hasInteractionLineOfSight(a: Agent, b: Agent, roomId: string): boolean {
    if (a === b) return true;

    const gap = distance(a.position, b.position);
    const stepCount = Math.max(1, Math.ceil(gap / (this.state.floorplan.cellSize * 0.25)));

    for (let i = 0; i <= stepCount; i += 1) {
      const t = i / stepCount;
      const raw = rawTileAtWorld(this.state.floorplan, {
        x: lerp(a.position.x, b.position.x, t),
        y: lerp(a.position.y, b.position.y, t),
      });
      if (raw !== roomId) return false;
    }

    return true;
  }

  private updateDiagnostics(dt: number): void {
    this.diagnosticAccumulator += dt;
    const ones = this.state.agents.filter((agent) => agent.vote === 1).length;
    const perRoomCounts = new Map<string, { ones: number; total: number }>();
    for (const agent of this.state.agents) {
      if (!agent.currentRoomId) continue;
      const count = perRoomCounts.get(agent.currentRoomId) ?? { ones: 0, total: 0 };
      count.total += 1;
      count.ones += agent.vote;
      perRoomCounts.set(agent.currentRoomId, count);
    }

    const perRoomVote1Fraction: Record<string, number> = {};
    for (const [roomId, count] of perRoomCounts) {
      perRoomVote1Fraction[roomId] = count.total === 0 ? 0 : count.ones / count.total;
    }

    const lambda = this.config.tripletSamplesPerTick * this.config.interactionHz * 0.00075;
    const mu = this.config.forgettingRate + this.config.spontaneousDecayRate;
    const estimatedPc = lambda > 0 ? Math.min(1, 0.5 * (1 + mu / lambda)) : null;

    this.state.diagnostics = {
      globalVote1Fraction: ones / Math.max(1, this.state.agents.length),
      perRoomVote1Fraction,
      committedCount: this.state.agents.filter((agent) => agent.mode === "committedToLeave").length,
      leavingCount: this.state.agents.filter((agent) => agent.mode === "leavingThroughDoor").length,
      estimatedPc,
      history: this.state.diagnostics.history,
    };

    if (this.diagnosticAccumulator >= 0.12) {
      this.state.diagnostics.history = [
        ...this.state.diagnostics.history,
        { t: this.state.time, p: this.state.diagnostics.globalVote1Fraction },
      ].slice(-240);
      this.diagnosticAccumulator = 0;
    }
  }

  private sampleDistinct<T>(items: T[], count: number): T[] {
    const result: T[] = [];
    while (result.length < count) {
      const item = items[this.rng.int(items.length)];
      if (!result.includes(item)) result.push(item);
    }
    return result;
  }
}

function emptyDiagnostics(): DiagnosticsSnapshot {
  return {
    globalVote1Fraction: 0,
    perRoomVote1Fraction: {},
    committedCount: 0,
    leavingCount: 0,
    estimatedPc: null,
    history: [],
  };
}
