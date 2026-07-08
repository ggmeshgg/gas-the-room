import { CanvasRenderer } from "../render/CanvasRenderer";
import { defaultConfig, type ForgettingMode, type SimConfig, type TimerMode } from "../sim/SimConfig";
import { Simulation } from "../sim/Simulation";

export class SimulatorApp {
  private config: SimConfig = defaultConfig();
  private simulation: Simulation | null = null;
  private renderer: CanvasRenderer | null = null;
  private canvas!: HTMLCanvasElement;
  private mapText!: HTMLTextAreaElement;
  private diagnosticsEl!: HTMLDivElement;
  private paused = false;
  private lastFrame = performance.now();
  private accumulator = 0;
  private spraying = false;

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    const source = await fetch("/floorplans/default.txt").then((res) => res.text());
    this.root.innerHTML = this.template();
    this.canvas = this.root.querySelector<HTMLCanvasElement>("#sim-canvas")!;
    this.mapText = this.root.querySelector<HTMLTextAreaElement>("#map-text")!;
    this.diagnosticsEl = this.root.querySelector<HTMLDivElement>("#diagnostics")!;
    this.mapText.value = source;
    this.simulation = new Simulation(source, this.config);
    this.renderer = new CanvasRenderer(this.canvas);
    this.bindControls();
    requestAnimationFrame((time) => this.frame(time));
  }

  private frame(time: number): void {
    const dt = Math.min(0.05, (time - this.lastFrame) / 1000);
    this.lastFrame = time;
    if (this.simulation && !this.paused) {
      this.accumulator += dt;
      const fixed = 1 / 60;
      while (this.accumulator >= fixed) {
        this.simulation.step(fixed);
        this.accumulator -= fixed;
      }
    }
    if (this.simulation && this.renderer) {
      this.renderer.render(this.simulation, this.config);
      this.renderDiagnostics();
    }
    requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  private bindControls(): void {
    const bindNumber = (id: string, key: keyof SimConfig, parse: (value: string) => number = Number) => {
      const input = this.root.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = String(this.config[key]);
      input.addEventListener("input", () => {
        this.config = { ...this.config, [key]: parse(input.value) };
        this.simulation?.setConfig(this.config);
      });
    };

    bindNumber("agentCount", "agentCount", (value) => Math.max(1, Math.floor(Number(value))));
    bindNumber("agentSpeed", "agentSpeed");
    bindNumber("interactionRadius", "interactionRadius");
    bindNumber("interactionHz", "interactionHz");
    bindNumber("tripletSamplesPerTick", "tripletSamplesPerTick", (value) => Math.max(1, Math.floor(Number(value))));
    bindNumber("forgettingRate", "forgettingRate");
    bindNumber("spontaneousDecayRate", "spontaneousDecayRate");
    bindNumber("miasmaIntensity", "miasmaIntensity");
    bindNumber("miasmaDecay", "miasmaDecay");
    bindNumber("exposureSensitivity", "exposureSensitivity");
    bindNumber("leaveTimerSeconds", "leaveTimerSeconds");
    bindNumber("timerDecayRate", "timerDecayRate");

    const bindCheck = (id: string, key: keyof SimConfig) => {
      const input = this.root.querySelector<HTMLInputElement>(`#${id}`)!;
      input.checked = Boolean(this.config[key]);
      input.addEventListener("change", () => {
        this.config = { ...this.config, [key]: input.checked };
        this.simulation?.setConfig(this.config);
      });
    };
    bindCheck("showInteractionRadius", "showInteractionRadius");
    bindCheck("showVoteColors", "showVoteColors");
    bindCheck("showTimerFill", "showTimerFill");
    bindCheck("showMiasmaField", "showMiasmaField");
    bindCheck("showNeighborLinks", "showNeighborLinks");

    const forgetting = this.root.querySelector<HTMLSelectElement>("#forgettingMode")!;
    forgetting.value = this.config.forgettingMode;
    forgetting.addEventListener("change", () => {
      this.config = { ...this.config, forgettingMode: forgetting.value as ForgettingMode };
      this.simulation?.setConfig(this.config);
    });

    const timerMode = this.root.querySelector<HTMLSelectElement>("#timerMode")!;
    timerMode.value = this.config.timerMode;
    timerMode.addEventListener("change", () => {
      this.config = { ...this.config, timerMode: timerMode.value as TimerMode };
      this.simulation?.setConfig(this.config);
    });

    this.root.querySelector<HTMLButtonElement>("#pause")!.addEventListener("click", (event) => {
      this.paused = !this.paused;
      (event.currentTarget as HTMLButtonElement).textContent = this.paused ? "Play" : "Pause";
    });
    this.root.querySelector<HTMLButtonElement>("#step")!.addEventListener("click", () => this.simulation?.step(1 / 15));
    this.root.querySelector<HTMLButtonElement>("#resetAgents")!.addEventListener("click", () => this.simulation?.resetAgents());
    this.root.querySelector<HTMLButtonElement>("#clearMiasma")!.addEventListener("click", () => this.simulation?.state.miasma.clear());
    this.root.querySelector<HTMLButtonElement>("#reloadMap")!.addEventListener("click", () => {
      try {
        this.simulation?.loadFloorplan(this.mapText.value);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : String(error));
      }
    });

    const spray = (event: PointerEvent) => {
      if (!this.simulation || !this.spraying) return;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = Number.parseFloat(this.canvas.style.width) / rect.width;
      const scaleY = Number.parseFloat(this.canvas.style.height) / rect.height;
      this.simulation.sprayMiasma(
        { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY },
        44,
      );
    };

    this.canvas.addEventListener("pointerdown", (event) => {
      this.spraying = true;
      this.canvas.setPointerCapture(event.pointerId);
      spray(event);
    });
    this.canvas.addEventListener("pointermove", spray);
    this.canvas.addEventListener("pointerup", (event) => {
      this.spraying = false;
      this.canvas.releasePointerCapture(event.pointerId);
    });
  }

  private renderDiagnostics(): void {
    if (!this.simulation) return;
    const d = this.simulation.state.diagnostics;
    const rooms = Object.entries(d.perRoomVote1Fraction)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([room, p]) => `room ${room}: ${(p * 100).toFixed(0)}%`)
      .join(" | ");
    this.diagnosticsEl.innerHTML = `
      <div><b>vote 1</b> ${(d.globalVote1Fraction * 100).toFixed(1)}%</div>
      <div><b>committed</b> ${d.committedCount} <b>leaving</b> ${d.leavingCount}</div>
      <div><b>p_c guide</b> ${d.estimatedPc === null ? "n/a" : d.estimatedPc.toFixed(2)}</div>
      <div>${rooms}</div>
      <canvas id="plot" width="260" height="54"></canvas>
    `;
    const plot = this.diagnosticsEl.querySelector<HTMLCanvasElement>("#plot");
    const ctx = plot?.getContext("2d");
    if (!ctx || !plot) return;
    ctx.clearRect(0, 0, plot.width, plot.height);
    ctx.strokeStyle = "#d34d3f";
    ctx.beginPath();
    d.history.forEach((point, index) => {
      const x = (index / Math.max(1, d.history.length - 1)) * plot.width;
      const y = plot.height - point.p * plot.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  private template(): string {
    return `
      <main class="shell">
        <section class="viewport">
          <canvas id="sim-canvas"></canvas>
        </section>
        <aside class="panel">
          <div class="actions">
            <button id="pause">Pause</button>
            <button id="step">Step</button>
            <button id="resetAgents">Respawn</button>
            <button id="clearMiasma">Clear gas</button>
          </div>
          <div id="diagnostics" class="diagnostics"></div>
          <label>Agents <input id="agentCount" type="number" min="1" max="500" /></label>
          <label>Speed <input id="agentSpeed" type="range" min="10" max="120" step="1" /></label>
          <label>Radius <input id="interactionRadius" type="range" min="12" max="120" step="1" /></label>
          <label>Interaction Hz <input id="interactionHz" type="range" min="1" max="30" step="1" /></label>
          <label>Triplet samples <input id="tripletSamplesPerTick" type="range" min="10" max="800" step="10" /></label>
          <label>Forgetting mode
            <select id="forgettingMode">
              <option value="pairwise10To00">pairwise 10 -> 00</option>
              <option value="spontaneousX1ToX0">spontaneous 1 -> 0</option>
              <option value="both">both</option>
            </select>
          </label>
          <label>Pair forgetting <input id="forgettingRate" type="range" min="0" max="1" step="0.01" /></label>
          <label>Spontaneous decay <input id="spontaneousDecayRate" type="range" min="0" max="0.6" step="0.01" /></label>
          <label>Miasma intensity <input id="miasmaIntensity" type="range" min="0.1" max="4" step="0.1" /></label>
          <label>Miasma decay <input id="miasmaDecay" type="range" min="0" max="0.5" step="0.005" /></label>
          <label>Exposure sensitivity <input id="exposureSensitivity" type="range" min="0" max="3" step="0.05" /></label>
          <label>T_leave <input id="leaveTimerSeconds" type="range" min="0.5" max="12" step="0.1" /></label>
          <label>Timer mode
            <select id="timerMode">
              <option value="reset">reset</option>
              <option value="decay">decay</option>
            </select>
          </label>
          <label>Timer decay <input id="timerDecayRate" type="range" min="0" max="6" step="0.1" /></label>
          <div class="checks">
            <label><input id="showInteractionRadius" type="checkbox" /> radii</label>
            <label><input id="showVoteColors" type="checkbox" /> vote colors</label>
            <label><input id="showTimerFill" type="checkbox" /> timers</label>
            <label><input id="showMiasmaField" type="checkbox" /> miasma</label>
            <label><input id="showNeighborLinks" type="checkbox" /> links</label>
          </div>
          <div class="mapHeader">
            <span>ASCII floorplan</span>
            <button id="reloadMap">Reload map</button>
          </div>
          <textarea id="map-text" spellcheck="false"></textarea>
        </aside>
      </main>
    `;
  }
}
