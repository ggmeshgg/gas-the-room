export type TimerMode = "reset" | "decay";
export type ForgettingMode = "pairwise10To00" | "spontaneousX1ToX0" | "both";

export type SimConfig = {
  agentCount: number;
  agentSpeed: number;
  interactionRadius: number;
  interactionHz: number;
  tripletSamplesPerTick: number;
  forgettingMode: ForgettingMode;
  forgettingRate: number;
  spontaneousDecayRate: number;
  miasmaIntensity: number;
  miasmaDecay: number;
  exposureSensitivity: number;
  exposureDecay: number;
  leaveTimerSeconds: number;
  timerMode: TimerMode;
  timerDecayRate: number;
  consensusThreshold: number;
  showInteractionRadius: boolean;
  showVoteColors: boolean;
  showTimerFill: boolean;
  showMiasmaField: boolean;
  showNeighborLinks: boolean;
};

export function defaultConfig(): SimConfig {
  return {
    agentCount: 90,
    agentSpeed: 120,
    interactionRadius: 120,
    interactionHz: 8,
    tripletSamplesPerTick: 120,
    forgettingMode: "both",
    forgettingRate: 0.16,
    spontaneousDecayRate: 0.05,
    miasmaIntensity: 1.6,
    miasmaDecay: 0.055,
    exposureSensitivity: 0.9,
    exposureDecay: 0.18,
    leaveTimerSeconds: 3.2,
    timerMode: "reset",
    timerDecayRate: 1.4,
    consensusThreshold: 0.5,
    showInteractionRadius: false,
    showVoteColors: true,
    showTimerFill: true,
    showMiasmaField: true,
    showNeighborLinks: false,
  };
}
