import type { SeepAction, SeepView } from "./engine";
import { isVoiceStatus, type VoiceMember, type VoiceStatus } from "../game/voiceProtocol";

export const SEEP_PROTOCOL = 1;
export const seepHostId = (code: string) => `seep-card-v1-${code.trim().toUpperCase()}`;
export function makeSeepRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => chars[value % chars.length]).join("");
}
export interface SeepLobbyView { names: string[]; seatsTaken: boolean[]; pendingNames: string[]; viewer: number }
export type SeepGuestMessage =
  | { t: "hello"; game: "seep"; protocol: number; name: string }
  | { t: "choose-team"; team: 0 | 1 }
  | { t: "action"; handNumber: number; revision: number; action: SeepAction }
  | { t: "voice-status"; status: VoiceStatus };
export type SeepHostMessage =
  | { t: "lobby"; game: "seep"; protocol: number; lobby: SeepLobbyView }
  | { t: "state"; game: "seep"; protocol: number; view: SeepView }
  | { t: "voice-roster"; room: string; members: VoiceMember[] }
  | { t: "team-error"; message: string }
  | { t: "denied"; message: string }
  | { t: "closed" };

export function isSeepAction(raw: unknown): raw is SeepAction {
  if (!raw || typeof raw !== "object") return false;
  const move = raw as Record<string, unknown>;
  if (move.kind === "bid") return Number.isInteger(move.value) && Number(move.value) >= 9 && Number(move.value) <= 13;
  if (!["capture", "build", "drop"].includes(String(move.kind)) || typeof move.cardId !== "string"
    || !Array.isArray(move.floorIds) || move.floorIds.length > 52 || !move.floorIds.every((id) => typeof id === "string")) return false;
  return move.kind !== "build" || (Number.isInteger(move.value) && Number(move.value) >= 9 && Number(move.value) <= 13);
}

export function isSeepGuestMessage(raw: unknown): raw is SeepGuestMessage {
  if (!raw || typeof raw !== "object") return false;
  const msg = raw as Record<string, unknown>;
  if (msg.t === "hello") return msg.game === "seep" && typeof msg.protocol === "number" && typeof msg.name === "string";
  if (msg.t === "choose-team") return msg.team === 0 || msg.team === 1;
  if (msg.t === "action") return Number.isInteger(msg.handNumber) && Number.isInteger(msg.revision) && isSeepAction(msg.action);
  return msg.t === "voice-status" && isVoiceStatus(msg.status);
}