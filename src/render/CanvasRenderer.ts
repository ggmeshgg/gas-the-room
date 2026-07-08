import type { Agent } from "../agents/Agent";
import { tileKindAt, worldHeight, worldWidth } from "../geometry/Floorplan";
import type { Simulation } from "../sim/Simulation";
import type { SimConfig } from "../sim/SimConfig";

export class CanvasRenderer {
  constructor(private readonly canvas: HTMLCanvasElement) {}

  render(sim: Simulation, config: SimConfig): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const { floorplan } = sim.state;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = worldWidth(floorplan);
    const cssHeight = worldHeight(floorplan);
    if (this.canvas.width !== Math.floor(cssWidth * dpr) || this.canvas.height !== Math.floor(cssHeight * dpr)) {
      this.canvas.width = Math.floor(cssWidth * dpr);
      this.canvas.height = Math.floor(cssHeight * dpr);
      this.canvas.style.width = `${cssWidth}px`;
      this.canvas.style.height = `${cssHeight}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    this.drawFloorplan(ctx, sim);
    if (config.showMiasmaField) this.drawMiasma(ctx, sim);
    if (config.showNeighborLinks) this.drawNeighborLinks(ctx, sim);
    for (const agent of sim.state.agents) this.drawAgent(ctx, agent, config);
  }

  private drawFloorplan(ctx: CanvasRenderingContext2D, sim: Simulation): void {
    const plan = sim.state.floorplan;
    const colors = ["#f3eee8", "#e7f0ef", "#f0e8ef", "#e9eef7", "#eef1e5", "#efece2"];
    for (let y = 0; y < plan.height; y += 1) {
      for (let x = 0; x < plan.width; x += 1) {
        const kind = tileKindAt(plan, x, y);
        const raw = plan.tiles[y * plan.width + x] ?? " ";
        if (kind === "void") continue;
        if (kind === "wall") ctx.fillStyle = "#252423";
        else if (kind === "door") ctx.fillStyle = "#6ba67f";
        else ctx.fillStyle = colors[Math.max(0, raw.charCodeAt(0) - 49) % colors.length] ?? "#ececec";
        ctx.fillRect(x * plan.cellSize, y * plan.cellSize, plan.cellSize, plan.cellSize);
        if (kind === "room") {
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          ctx.font = "11px system-ui, sans-serif";
          ctx.fillText(raw, x * plan.cellSize + 5, y * plan.cellSize + 13);
        }
      }
    }
  }

  private drawMiasma(ctx: CanvasRenderingContext2D, sim: Simulation): void {
    const field = sim.state.miasma;
    for (let y = 0; y < field.height; y += 1) {
      for (let x = 0; x < field.width; x += 1) {
        const value = field.values[y * field.width + x] ?? 0;
        if (value <= 0.01) continue;
        const alpha = Math.min(0.72, value * 0.28);
        ctx.fillStyle = `rgba(111, 67, 142, ${alpha})`;
        ctx.fillRect(x * field.cellSize, y * field.cellSize, field.cellSize, field.cellSize);
      }
    }
  }

  private drawNeighborLinks(ctx: CanvasRenderingContext2D, sim: Simulation): void {
    ctx.strokeStyle = "rgba(20, 20, 20, 0.16)";
    ctx.lineWidth = 1;
    for (const [a, b] of sim.neighborLinks) {
      ctx.beginPath();
      ctx.moveTo(a.position.x, a.position.y);
      ctx.lineTo(b.position.x, b.position.y);
      ctx.stroke();
    }
  }

  private drawAgent(ctx: CanvasRenderingContext2D, agent: Agent, config: SimConfig): void {
    const radius = 6;
    if (config.showInteractionRadius) {
      ctx.beginPath();
      ctx.arc(agent.position.x, agent.position.y, agent.interactionRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(30, 50, 70, 0.08)";
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(agent.position.x, agent.position.y, radius, 0, Math.PI * 2);
    if (config.showVoteColors) {
      ctx.fillStyle = agent.vote === 1 ? "#d34d3f" : "#375a7f";
    } else {
      ctx.fillStyle = "#59616a";
    }
    ctx.fill();

    if (agent.mode === "committedToLeave" || agent.mode === "leavingThroughDoor") {
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#f4c542";
      ctx.stroke();
    }

    if (config.showTimerFill && agent.timer > 0) {
      const progress = Math.min(1, agent.timer / config.leaveTimerSeconds);
      ctx.beginPath();
      ctx.moveTo(agent.position.x, agent.position.y);
      ctx.arc(agent.position.x, agent.position.y, radius + 3, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = "rgba(244, 197, 66, 0.42)";
      ctx.fill();
    }
  }
}
