import type { Vec2 } from "../geometry/Vec2";

export type Vote = 0 | 1;

export type AgentMode = "wandering" | "votingToLeave" | "committedToLeave" | "leavingThroughDoor";

export type Agent = {
  id: string;
  position: Vec2;
  velocity: Vec2;
  vote: Vote;
  timer: number;
  mode: AgentMode;
  exposure: number;
  sensitivity: number;
  stubbornness: number;
  speed: number;
  interactionRadius: number;
  currentRoomId: string | null;
  targetDoorId: string | null;
  leavingRoomId: string | null;
  destinationRoomId: string | null;
  wanderAngle: number;
  wanderTime: number;
};
